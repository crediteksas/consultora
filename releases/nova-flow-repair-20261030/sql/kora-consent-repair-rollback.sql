-- Restore exact predecessor bodies; CREATE OR REPLACE preserves their ACLs.
CREATE OR REPLACE FUNCTION public.nova_retail_confirm_delivery(p_source uuid, p_actor uuid, p_revision integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.nova_retail_cases;p public.perfiles;
begin
 select * into strict p from public.perfiles where id=p_actor and activo;
 select * into strict r from public.nova_retail_cases where source_id=p_source for update;
 if not exists(select 1 from public.nova_retail_reviewers where actor_id=p_actor) and (p.rol<>'admin_tienda' or p.tienda_codigo<>r.store_code) then raise exception 'FORBIDDEN';end if;
 if r.state<>'authorized' or r.revision<>p_revision or (r.valid_until>now() and r.delivery_requested and r.query_requested_at>now()-interval '15 minutes' and r.summary->'queriesMadeForDelivery'='true'::jsonb) is not true then raise exception 'FRESH_VALIDATION_REQUIRED';end if;
 if exists(select 1 from public.nova_retail_cases where cliente_id=r.cliente_id and rejected_at>now()-interval '15 days') then raise exception 'REJECTED';end if;
 update public.nova_retail_cases set delivered_at=now(),revision=revision+1,updated_at=now() where source_id=p_source returning * into r;
 insert into public.nova_retail_case_events(source_id,revision,actor_id,actor_name,action,payload) values(p_source,r.revision,p.id,p.nombre,'delivery_confirmed',jsonb_build_object('fingerprint',r.fingerprint));return true;
end $function$;


CREATE OR REPLACE FUNCTION public.nova_retail_request_queries(p_source uuid, p_actor uuid, p_delivery boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.nova_retail_cases;p public.perfiles;
begin
 select * into strict p from public.perfiles where id=p_actor and activo;
 select * into strict r from public.nova_retail_cases where source_id=p_source for update;
 if not exists(select 1 from public.nova_retail_reviewers where actor_id=p_actor) and (p.rol<>'admin_tienda' or p.tienda_codigo<>r.store_code) then raise exception 'FORBIDDEN';end if;
 if r.delivered_at is not null or r.rejected_at>now()-interval '15 days' then raise exception 'CANNOT_RENEW';end if;
 update public.nova_retail_cases set query_request_id=gen_random_uuid(),query_requested_at=now(),delivery_requested=p_delivery,renewed_at=case when valid_until<=now() or valid_until is null then now() else renewed_at end,state='waiting',decision=jsonb_build_object('state','waiting','canProcess',false,'requiresAndrea',false,'reasons',jsonb_build_array('platform_queries_in_progress')),valid_until=null,manual_actor=null,manual_note=null,revision=revision+1,updated_at=now() where source_id=p_source returning * into r;
 insert into public.nova_retail_case_events(source_id,revision,actor_id,actor_name,action,payload) values(p_source,r.revision,p.id,p.nombre,case when p_delivery then 'delivery_queries_requested' else 'renewal_requested' end,jsonb_build_object('query_request_id',r.query_request_id));
 return to_jsonb(r);
end $function$;


CREATE OR REPLACE FUNCTION public.nova_retail_review(p_source uuid, p_revision integer, p_actor uuid, p_action text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.nova_retail_cases; p public.perfiles; s public.kora_nova_sources;
begin
 select * into strict p from public.perfiles where id=p_actor and activo;
 if not exists(select 1 from public.nova_retail_reviewers where actor_id=p.id and can_review) then raise exception 'NOT_REVIEWER';end if;
 if p_action not in ('approve','reject') or length(btrim(coalesce(p_note,''))) not between 3 and 2000 then raise exception 'NOTE_REQUIRED';end if;
 select * into strict r from public.nova_retail_cases where source_id=p_source for update;
 select * into strict s from public.kora_nova_sources where solicitud_id=p_source;
 if r.revision<>p_revision then raise exception 'REVISION_CHANGED';end if;
 if r.state<>'review' or r.decision->'reasons' ?| array['zero_payments','rejection_cooldown','consent_revoked','renewal_required','delivery_requery_required'] or s.revoked_at is not null then raise exception 'REVIEW_NOT_ALLOWED';end if;
 if p_action='approve' and (jsonb_array_length(coalesce(r.summary->'references','[]'::jsonb))<>2 or exists(select 1 from jsonb_array_elements(r.summary->'references') x where (x->>'status' not in ('approved','review') or x->'responded' is distinct from 'true'::jsonb)) or jsonb_array_length(coalesce(r.summary->'photos','[]'::jsonb))<>3 or exists(select 1 from jsonb_array_elements(r.summary->'photos') x where x->>'status' not in ('auto_approved','manual_pending','andrea_approved'))) then raise exception 'CORRECTIONS_OR_REFERENCES_PENDING';end if;
 if exists(select 1 from public.nova_retail_cases where cliente_id=r.cliente_id and rejected_at>now()-interval '15 days') then raise exception 'REJECTION_COOLDOWN';end if;
 update public.nova_retail_cases set revision=revision+1,state=case when p_action='approve' then 'authorized' else 'rejected' end,decision=decision||jsonb_build_object('state',case when p_action='approve' then 'authorized' else 'rejected' end,'canProcess',p_action='approve','requiresAndrea',false),manual_actor=p.id,manual_note=btrim(p_note),valid_until=case when p_action='approve' then now()+interval '15 days' else null end,rejected_at=case when p_action='reject' then now() else null end,updated_at=now() where source_id=p_source returning * into r;
 insert into public.nova_retail_case_events(source_id,revision,actor_id,actor_name,action,payload) values(p_source,r.revision,p.id,p.nombre,'review_'||p_action,jsonb_build_object('note',btrim(p_note),'fingerprint',r.fingerprint));
 insert into public.nova_retail_notifications(source_id,revision,audience) values(p_source,r.revision,'andrea'),(p_source,r.revision,'store') on conflict do nothing;
 return to_jsonb(r);
end $function$;


CREATE OR REPLACE FUNCTION public.nova_retail_save(p_source uuid, p_fingerprint text, p_decision jsonb, p_summary jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s public.kora_nova_sources; r public.nova_retail_cases; v_state text:=p_decision->>'state'; v_rejected timestamptz; v_revision integer; v_until timestamptz; v_previous_state text;
begin
 if p_fingerprint !~ '^[a-f0-9]{64}$' or v_state not in ('authorized','rejected','review','waiting','correct') or octet_length(p_summary::text)>65536 then raise exception 'INVALID_DECISION';end if;
 select * into strict s from public.kora_nova_sources where solicitud_id=p_source;
 if (s.registration->>'p_origen_codigo' ~ '^CK-0[1-9]$') is not true then raise exception 'OUT_OF_SCOPE';end if;
 perform pg_advisory_xact_lock(hashtextextended('nova-retail-customer:'||s.cliente_id::text,0));
 select * into r from public.nova_retail_cases where source_id=p_source for update;
 if found and r.fingerprint=p_fingerprint and (r.valid_until is null or r.valid_until>now()) then return to_jsonb(r);end if;
 v_previous_state:=r.state;
 v_revision:=coalesce(r.revision,0)+1;
 select max(rejected_at) into v_rejected from public.nova_retail_cases where cliente_id=s.cliente_id and rejected_at>now()-interval '15 days';
 if v_rejected is not null then
  v_state:='rejected';p_decision:=p_decision||jsonb_build_object('state','rejected','canProcess',false,'requiresAndrea',false,'reasons',jsonb_build_array('rejection_cooldown'),'overrideAllowed',false);
 elsif v_state='rejected' then v_rejected:=now();end if;
 if s.revoked_at is not null then
  v_state:='review';p_decision:=jsonb_build_object('state','review','canProcess',false,'requiresAndrea',true,'reasons',jsonb_build_array('consent_revoked'));
 end if;
 v_until:=case when v_state='authorized' then coalesce(r.renewed_at,s.submitted_at)+interval '15 days' else null end;
 if v_until<=now() then v_state:='review';p_decision:=p_decision||jsonb_build_object('state','review','canProcess',false,'requiresAndrea',true,'reasons',jsonb_build_array('renewal_required'));v_until:=null;end if;
 insert into public.nova_retail_cases(source_id,cliente_id,store_code,fingerprint,revision,state,decision,summary,rejected_at,valid_until)
 values(p_source,s.cliente_id,s.registration->>'p_origen_codigo',p_fingerprint,v_revision,v_state,p_decision,p_summary,v_rejected,v_until)
 on conflict(source_id) do update set fingerprint=excluded.fingerprint,revision=excluded.revision,state=excluded.state,decision=excluded.decision,summary=excluded.summary,rejected_at=excluded.rejected_at,valid_until=excluded.valid_until,manual_actor=null,manual_note=null,updated_at=now()
 returning * into r;
 insert into public.nova_retail_case_events(source_id,revision,actor_name,action,payload) values(p_source,r.revision,'NOVA','automatic_validation',jsonb_build_object('decision',p_decision,'summary',p_summary));
 if v_state in ('review','authorized','rejected') and v_previous_state is distinct from v_state then
  insert into public.nova_retail_notifications(source_id,revision,audience) values(p_source,r.revision,'andrea') on conflict do nothing;
  if v_state<>'review' then insert into public.nova_retail_notifications(source_id,revision,audience) values(p_source,r.revision,'store') on conflict do nothing;end if;
 end if;
 return to_jsonb(r);
end $function$;

DROP FUNCTION public.nova_retail_consent_current(uuid);

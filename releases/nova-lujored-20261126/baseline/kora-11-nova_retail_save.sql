CREATE OR REPLACE FUNCTION public.nova_retail_save(p_source uuid, p_fingerprint text, p_decision jsonb, p_summary jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s public.kora_nova_sources; r public.nova_retail_cases; v_state text:=p_decision->>'state'; v_rejected timestamptz; v_revision integer; v_until timestamptz; v_previous_state text; v_consent_active boolean;
begin
 if p_fingerprint !~ '^[a-f0-9]{64}$' or v_state not in ('authorized','rejected','review','waiting','correct') or octet_length(p_summary::text)>65536 then raise exception 'INVALID_DECISION';end if;
 select * into strict s from public.kora_nova_sources where solicitud_id=p_source;
 if (s.registration->>'p_origen_codigo' ~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C)$') is not true then raise exception 'OUT_OF_SCOPE';end if;
 v_consent_active:=public.nova_retail_consent_current(p_source);
 perform pg_advisory_xact_lock(hashtextextended('nova-retail-customer:'||s.cliente_id::text,0));
 select * into r from public.nova_retail_cases where source_id=p_source for update;
 if found and r.fingerprint=p_fingerprint and (r.valid_until is null or r.valid_until>now()) and (v_consent_active or r.decision->'reasons' ? 'consent_revoked') then return to_jsonb(r);end if;
 v_previous_state:=r.state;
 v_revision:=coalesce(r.revision,0)+1;
 select max(rejected_at) into v_rejected from public.nova_retail_cases where cliente_id=s.cliente_id and rejected_at>now()-interval '15 days';
 if v_rejected is not null then
  v_state:='rejected';p_decision:=p_decision||jsonb_build_object('state','rejected','canProcess',false,'requiresAndrea',false,'reasons',jsonb_build_array('rejection_cooldown'),'overrideAllowed',false);
 elsif v_state='rejected' then v_rejected:=now();end if;
 if s.revoked_at is not null or v_consent_active is not true then
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
end $function$

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
 if public.nova_retail_consent_current(p_source) is not true then raise exception 'CONSENT_REVOKED' using errcode='P0001';end if;
 select * into strict r from public.nova_retail_cases where source_id=p_source for update;
 select * into strict s from public.kora_nova_sources where solicitud_id=p_source;
 if r.revision<>p_revision then raise exception 'REVISION_CHANGED';end if;
 if r.state<>'review' or r.decision->'reasons' ?| array['zero_payments','rejection_cooldown','consent_revoked','renewal_required','delivery_requery_required'] or s.revoked_at is not null then raise exception 'REVIEW_NOT_ALLOWED';end if;
 if p_action='approve' and coalesce(r.decision->'reasons','[]'::jsonb) ?| array['zero_payments','more_than_two_overdue','overdue_with_less_than_four_paid'] then raise exception 'RESTRICTED_CONDITIONS';end if;
 if p_action='approve' and r.decision->'platformsReady' = 'false'::jsonb then raise exception 'THREE_PLATFORM_RESULTS_REQUIRED'; end if;
 if p_action='approve' and (jsonb_array_length(coalesce(r.summary->'references','[]'::jsonb))<>2 or exists(select 1 from jsonb_array_elements(r.summary->'references') x where (x->>'status' not in ('approved','review') or x->'responded' is distinct from 'true'::jsonb)) or jsonb_array_length(coalesce(r.summary->'photos','[]'::jsonb))<>3 or exists(select 1 from jsonb_array_elements(r.summary->'photos') x where x->>'status' not in ('auto_approved','manual_pending','andrea_approved'))) then raise exception 'CORRECTIONS_OR_REFERENCES_PENDING';end if;
 if exists(select 1 from public.nova_retail_cases where cliente_id=r.cliente_id and rejected_at>now()-interval '15 days') then raise exception 'REJECTION_COOLDOWN';end if;
 update public.nova_retail_cases set revision=revision+1,state=case when p_action='approve' then 'authorized' else 'rejected' end,decision=decision||jsonb_build_object('state',case when p_action='approve' then 'authorized' else 'rejected' end,'canProcess',p_action='approve','requiresAndrea',false),manual_actor=p.id,manual_note=btrim(p_note),valid_until=case when p_action='approve' then now()+interval '15 days' else null end,rejected_at=case when p_action='reject' then now() else null end,updated_at=now() where source_id=p_source returning * into r;
 insert into public.nova_retail_case_events(source_id,revision,actor_id,actor_name,action,payload) values(p_source,r.revision,p.id,p.nombre,'review_'||p_action,jsonb_build_object('note',btrim(p_note),'fingerprint',r.fingerprint));
 insert into public.nova_retail_notifications(source_id,revision,audience) values(p_source,r.revision,'andrea'),(p_source,r.revision,'store') on conflict do nothing;
 return to_jsonb(r);
end $function$

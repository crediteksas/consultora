alter table public.nova_reference_verifications add column superseded_at timestamptz;
alter table public.nova_reference_verifications drop constraint nova_reference_verifications_application_id_reference_type_key;
create unique index nova_active_reference_type on public.nova_reference_verifications(application_id,reference_type) where superseded_at is null;
CREATE OR REPLACE FUNCTION public.nova_reference_context(p_reference_id uuid, p_contact_hash text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select jsonb_build_object('reference_id',r.id,'application_id',r.application_id,'reference_type',r.reference_type,
 'contact_hash',r.contact_hash,'source_application_id',receipt.source_application_id,'payload_hash',receipt.payload_hash,
 'received_at',receipt.received_at,'dialogue',to_jsonb(d))
 from public.nova_reference_verifications r
 join public.nova_credit_applications a on a.id=r.application_id
 join public.nova_registration_receipts receipt on receipt.application_id=a.id
 left join public.nova_reference_dialogues d on d.reference_id=r.id
 where r.id=p_reference_id and r.contact_hash=p_contact_hash and a.store_code ~ '^CK-0[1-9]$' and r.superseded_at is null and a.data_consent_granted is true;
$function$;

CREATE OR REPLACE FUNCTION public.nova_reference_sync_summary()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if new.status='completed' and new.state->>'stage'='completed'
 and new.state->'consent'='true'::jsonb
 and new.outcome in ('response_collected','does_not_know')
 and exists (
  select 1 from public.nova_reference_otps o
  where o.reference_id=new.reference_id and o.state->>'status'='verified'
  and o.state->'scope'->>'payloadHash'=new.payload_hash
  and o.state->'scope'->>'contactHash'=new.contact_hash
  and (o.state->'scope'->>'consentAt')::bigint =
      (extract(epoch from (new.state->>'consentAt')::timestamptz)*1000)::bigint
 ) then
  update public.nova_reference_verifications
  set consent_status='granted',
      verification_status=case when new.outcome='response_collected' then 'confirmed' else 'manual_review' end,
      consent_at=(new.state->>'consentAt')::timestamptz,
      verified_at=(new.state->>'completedAt')::timestamptz,
      updated_at=now()
  where id=new.reference_id and application_id=new.application_id and contact_hash=new.contact_hash;
 elsif new.status='declined' and new.state->>'stage'='declined'
 and new.state->'consent'='false'::jsonb and new.outcome='declined' then
  update public.nova_reference_verifications
  set consent_status='declined',verification_status='declined',verified_at=null,updated_at=now()
  where id=new.reference_id and application_id=new.application_id and contact_hash=new.contact_hash;
 end if;
 return new;
end;$function$;

CREATE OR REPLACE FUNCTION public.nova_reference_transition(p_reference_id uuid, p_contact_hash text, p_payload_hash text, p_expires_at timestamp with time zone, p_revision integer, p_event_id text, p_event_hash text, p_state jsonb, p_outcome text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare context jsonb; d public.nova_reference_dialogues; prior public.nova_reference_events; k text;
begin
 context:=public.nova_reference_context(p_reference_id,p_contact_hash);
 if context is null or context->>'payload_hash' is distinct from p_payload_hash
 or p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '24 hours'
 or p_event_id is null or length(p_event_id) not between 1 and 200
 or (p_event_hash ~ '^[a-f0-9]{64}$') is not true then raise exception 'REFERENCE_SCOPE_REQUIRED';end if;
 -- Hold one recipient at a time, with explicit invitation binding to a case.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('NOVA:REF:'||p_contact_hash,0));
 update public.nova_reference_dialogues set status='stopped',updated_at=now()
 where contact_hash=p_contact_hash and status='active' and expires_at<=now();
 if exists(select 1 from public.nova_reference_dialogues where contact_hash=p_contact_hash and reference_id<>p_reference_id and status='active') then
 return jsonb_build_object('ok',false,'reason','OTHER_REFERENCE_ACTIVE');end if;
 insert into public.nova_reference_dialogues(reference_id,application_id,contact_hash,payload_hash,expires_at)
 values(p_reference_id,(context->>'application_id')::uuid,p_contact_hash,p_payload_hash,p_expires_at) on conflict do nothing;
 select * into d from public.nova_reference_dialogues where reference_id=p_reference_id for update;
 select * into prior from public.nova_reference_events where reference_id=p_reference_id and event_id=p_event_id;
 if found then
  if prior.event_hash<>p_event_hash then raise exception 'REFERENCE_REPLAY_CONFLICT';end if;
  return jsonb_build_object('ok',true,'duplicate',true);
 end if;
 if d.revision<>p_revision or d.revision>=30 or d.expires_at<=now() or d.status in ('declined','stopped')
   then return jsonb_build_object('ok',false,'reason','REFERENCE_CHANGED_OR_CLOSED');end if;
 if d.send_state='reserved' then return jsonb_build_object('ok',false,'retryable',true);end if;
 if p_expires_at<>d.expires_at or p_payload_hash<>d.payload_hash then raise exception 'REFERENCE_CHANGED';end if;
 if (jsonb_typeof(p_state)='object' and p_state->>'stage' in ('consent','knows','relationship','contact','duration','completed','declined')) is not true
  then raise exception 'INVALID_REFERENCE_STATE';end if;
 if exists(select 1 from jsonb_object_keys(p_state) x where x not in ('stage','consent','consentAt','answers','completedAt')) then raise exception 'UNSAFE_REFERENCE_STATE';end if;
 if octet_length(p_state::text)>1024 then raise exception 'UNSAFE_REFERENCE_STATE';end if;
 if d.status='completed' and p_state->>'stage'<>'declined' then raise exception 'REFERENCE_COMPLETED';end if;
 if p_state->>'stage' not in ('completed','declined') and p_outcome is not null then raise exception 'PREMATURE_REFERENCE_OUTCOME';end if;
 if p_state->>'stage' in ('knows','relationship','contact','duration','completed') and
 (p_state->'consent'='true'::jsonb and jsonb_typeof(p_state->'consentAt')='string' and
 (p_state->>'consentAt')::timestamptz<=now()+interval '1 minute' and (p_state->>'consentAt')::timestamptz>now()-interval '24 hours') is not true then raise exception 'REFERENCE_CONSENT_REQUIRED';end if;
 if p_state ? 'answers' then
  if jsonb_typeof(p_state->'answers')<>'object' or p_state->'consent' is distinct from 'true'::jsonb then raise exception 'REFERENCE_CONSENT_REQUIRED';end if;
  for k in select jsonb_object_keys(p_state->'answers') loop
   if k='knows' and p_state->'answers'->k in ('true'::jsonb,'false'::jsonb,'null'::jsonb) then continue;end if;
   if k='relationship' and p_state->'answers'->>k in ('family','friend','neighbor','coworker','other') then continue;end if;
   if k='contact_confirmed' and p_state->'answers'->k in ('true'::jsonb,'false'::jsonb) then continue;end if;
   if k='duration' and p_state->'answers'->>k in ('under_one_year','one_to_three_years','over_three_years','unknown') then continue;end if;
   raise exception 'UNSAFE_REFERENCE_ANSWER';
  end loop;
 end if;
 if p_outcome is not null and p_outcome not in ('response_collected','does_not_know','declined') then raise exception 'INVALID_REFERENCE_OUTCOME';end if;
 if (p_state->>'stage'='completed' and (p_state->'consent'='true'::jsonb and p_outcome in ('response_collected','does_not_know')) is not true)
 or (p_state->>'stage'='declined' and (p_state->'consent'='false'::jsonb and p_outcome='declined' and not(p_state?'answers')) is not true)
 then raise exception 'INCOMPLETE_REFERENCE';end if;
 update public.nova_reference_dialogues set revision=revision+1,state=p_state,
 status=case when p_state->>'stage' in ('completed','declined') then p_state->>'stage' else 'active' end,
 outcome=p_outcome,send_state='reserved',attempt_id=gen_random_uuid(),event_id=p_event_id,event_hash=p_event_hash,updated_at=now()
 where reference_id=p_reference_id returning * into d;
 insert into public.nova_reference_events values(p_reference_id,p_event_id,p_event_hash,d.revision);
 return jsonb_build_object('ok',true,'attempt_id',d.attempt_id,'revision',d.revision);
end;$function$;

CREATE OR REPLACE FUNCTION public.nova_reference_otp_dialogue_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s jsonb;
begin
 if new.state->>'stage' in ('relationship','contact','duration','completed') then
  select state into s from public.nova_reference_otps where reference_id=new.reference_id;
  if s->>'status' is distinct from 'verified' or s->'scope'->>'payloadHash' is distinct from new.payload_hash
  or s->'scope'->>'contactHash' is distinct from new.contact_hash
  or (s->'scope'->>'consentAt')::bigint is distinct from (extract(epoch from (new.state->>'consentAt')::timestamptz)*1000)::bigint
  then raise exception 'REFERENCE_PHONE_PROOF_REQUIRED';end if;
 end if;
 if new.state->>'stage'='declined' and old.state->>'stage' is distinct from 'declined' then
  update public.nova_reference_otps set state=(state-'digest'-'providerMessageId'-'verifiedAt')||'{"status":"revoked"}'::jsonb,
  revision=revision+1,updated_at=now() where reference_id=new.reference_id;
 end if;
 return new;
end;$function$;
create function public.nova_retail_replace_reference(p_source uuid,p_old uuid,p_new uuid,p_hash text,p_customer_hash text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare r public.nova_reference_verifications; d public.nova_reference_dialogues; delivered public.nova_retail_reference_dispatch;
begin
 select * into strict r from public.nova_reference_verifications where id=p_old for update;
 if r.superseded_at is not null or p_hash !~ '^[a-f0-9]{64}$' or p_hash in (r.contact_hash,p_customer_hash) then raise exception 'INVALID_REPLACEMENT';end if;
 if not exists(select 1 from public.nova_registration_receipts s join public.nova_credit_applications a on a.id=s.application_id where s.application_id=r.application_id and s.source_application_id=p_source and a.store_code ~ '^CK-0[1-9]$') then raise exception 'OUT_OF_SCOPE';end if;
 select * into d from public.nova_reference_dialogues where reference_id=p_old;
 select * into delivered from public.nova_retail_reference_dispatch where reference_id=p_old;
 if d.status='completed' or d.outcome='does_not_know' then raise exception 'REVIEW_REQUIRED';end if;
 if not (coalesce(d.status='declined',false) or coalesce(delivered.delivered_at<=now()-interval '10 minutes',false) or (delivered.state='failed' and delivered.attempts>=5)) then raise exception 'WAIT_FOR_REFERENCE';end if;
 if exists(select 1 from public.nova_reference_verifications where application_id=r.application_id and superseded_at is null and contact_hash=p_hash) then raise exception 'DUPLICATE_REFERENCE';end if;
 if exists(select 1 from public.nova_reference_dialogues where contact_hash=p_hash and status='declined') then raise exception 'CONTACT_DECLINED';end if;
 update public.nova_reference_verifications set superseded_at=now(),updated_at=now() where id=p_old;
 update public.nova_reference_dialogues set status='stopped',updated_at=now() where reference_id=p_old and status='active';
 update public.nova_retail_reference_dispatch set state='cancelled',updated_at=now() where reference_id=p_old and state in ('sending','accepted','sent','failed');
 insert into public.nova_reference_verifications(id,application_id,reference_type,contact_hash,consent_status,verification_status,attempts) values(p_new,r.application_id,r.reference_type,p_hash,'pending','pending',0);
 return p_new;
end $$;
revoke all on function public.nova_retail_replace_reference(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.nova_retail_replace_reference(uuid,uuid,uuid,text,text) to service_role;

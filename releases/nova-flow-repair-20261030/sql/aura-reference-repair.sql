-- REF01 + REF02. Proposal only: no sends, no existing dialogue reopening or expiry changes.
-- Apply before the Worker; CREATE OR REPLACE preserves the existing service_role-only ACL.
do $guard$ begin
 if (select md5(prosrc) from pg_catalog.pg_proc where oid='public.nova_reference_send_ack(uuid,uuid,boolean)'::regprocedure) is distinct from '78632826b01fb1f0e4a68da06e443417' then raise exception 'REF_REPAIR_SQL_DRIFT:nova_reference_send_ack';end if;
 if (select md5(prosrc) from pg_catalog.pg_proc where oid='public.nova_reference_transition(uuid,text,text,timestamp with time zone,integer,text,text,jsonb,text)'::regprocedure) is distinct from '8ce803078e85ed1f775eef018dbc4ea3' then raise exception 'REF_REPAIR_SQL_DRIFT:nova_reference_transition';end if;
 if (select md5(prosrc) from pg_catalog.pg_proc where oid='public.nova_retail_reference_status(text,text,text,timestamp with time zone,integer)'::regprocedure) is distinct from '8b5caf659c1fd9600e5434edfc75193f' then raise exception 'REF_REPAIR_SQL_DRIFT:nova_retail_reference_status';end if;
end $guard$;
alter table public.nova_reference_dialogues drop constraint nova_reference_dialogues_send_state_check;
alter table public.nova_reference_dialogues add constraint nova_reference_dialogues_send_state_check check (send_state in ('none','reserved','accepted','failed','uncertain'));

CREATE OR REPLACE FUNCTION public.nova_retail_reference_status(p_message_id text, p_contact_hash text, p_status text, p_at timestamp with time zone, p_error integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare d public.nova_retail_reference_dispatch; latest_at timestamptz; apply_event boolean:=false;
begin
 if (p_status in ('sent','delivered','read','failed') and p_at is not null
     and p_at<=now()+interval '1 minute') is not true then return false;end if;
 -- Serialize callbacks and retries against the currently reserved attempt/message.
 select * into d from public.nova_retail_reference_dispatch
 where provider_message_id=p_message_id and contact_hash=p_contact_hash for update;
 if not found or d.state='cancelled' or p_at<d.created_at-interval '1 minute' then return false;end if;
 if exists(select 1 from public.nova_retail_reference_dispatch_events e
   where e.reference_id=d.reference_id and e.provider_message_id=p_message_id
     and e.status=p_status and e.at=p_at and e.error_code is not distinct from p_error)
 then return true;end if;
 select max(e.at) into latest_at from public.nova_retail_reference_dispatch_events e
 where e.reference_id=d.reference_id and e.provider_message_id=p_message_id
   and e.status in ('sent','delivered','read','failed');
 -- Delivery/read proof wins over lesser states. sent/failed respect event time;
 -- on a tie, a failure must not be erased by a sent callback.
 if p_status in ('delivered','read') then apply_event:=true;
 elsif d.state not in ('delivered','read') and
   (latest_at is null or p_at>latest_at or (p_at=latest_at and p_status='failed'))
 then apply_event:=true;end if;
 if apply_event then
  update public.nova_retail_reference_dispatch set
    state=case when d.state='read' then 'read'
      when d.state='delivered' and p_status<>'read' then 'delivered' else p_status end,
    delivered_at=case when p_status in ('delivered','read')
      then least(coalesce(d.delivered_at,p_at),p_at) else d.delivered_at end,
    error_code=case when p_status='failed' then p_error else null end,
    updated_at=now()
  where reference_id=d.reference_id;
 end if;
 -- Keep stale callbacks as evidence without changing the current attempt.
 insert into public.nova_retail_reference_dispatch_events(reference_id,status,provider_message_id,error_code,at)
 values(d.reference_id,p_status,p_message_id,p_error,p_at);
 return true;
end;$function$;

CREATE OR REPLACE FUNCTION public.nova_reference_send_ack(p_reference_id uuid, p_attempt_id uuid, p_accepted boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 update public.nova_reference_dialogues set send_state=case when p_accepted is true then 'accepted' when p_accepted is false then 'failed' else 'uncertain' end,
 status=case when p_accepted is false then 'stopped' else status end,updated_at=now()
 where reference_id=p_reference_id and attempt_id=p_attempt_id and send_state='reserved';
 return jsonb_build_object('saved',found);
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
 -- An invocation may end after committing a turn but before saving its transport
 -- acknowledgement. Only a new inbound event may release an abandoned lease;
 -- replay was checked above. Preserve state, evidence and original expiry.
 if d.send_state='reserved' then
  if d.updated_at>clock_timestamp()-interval '1 minute' then
   return jsonb_build_object('ok',false,'retryable',true);
  end if;
  update public.nova_reference_dialogues set send_state='uncertain',updated_at=now()
   where reference_id=p_reference_id returning * into d;
 end if;
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

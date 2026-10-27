CREATE OR REPLACE FUNCTION public.nova_accept_platform_renewal(p_renewal_id uuid, p_source_id uuid, p_application_id uuid, p_payload_hash text, p_consent jsonb, p_inputs jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare previous jsonb; result jsonb; n integer; old public.nova_platform_renewal_receipts;
begin
 perform 1 from public.nova_credit_applications a join public.nova_registration_receipts r on r.application_id=a.id
 where a.id=p_application_id and a.store_code ~ '^CK-0[1-9]$' and a.data_consent_granted=true
 and r.source_application_id=p_source_id and r.payload_hash=p_payload_hash for update of a;
 if not found then raise exception 'INVALID_RECEIPT';end if;
 select * into old from public.nova_platform_renewal_receipts where renewal_id=p_renewal_id;
 if found then
  if old.source_application_id<>p_source_id or old.consent is distinct from p_consent then raise exception 'RENEWAL_CONFLICT';end if;
  return old.result;
 end if;
 if p_renewal_id is null or (p_consent->'granted'='true'::jsonb and p_consent->'revoked'='false'::jsonb
  and p_consent->>'text_version'='nova-platform-query-v1' and jsonb_array_length(p_consent->'platforms')=3
  and p_consent->'platforms' @> '["PAYJOY","KREDIYA","ALO"]'::jsonb
  and (p_consent->>'accepted_at')::timestamptz<=now() and (p_consent->>'expires_at')::timestamptz>now()+interval '3 minutes'
  and (p_consent->>'expires_at')::timestamptz<=(p_consent->>'accepted_at')::timestamptz+interval '24 hours'
  and p_inputs->>'document' ~ '^[0-9]{6,12}$' and p_inputs->>'phone' ~ '^3[0-9]{9}$') is not true then raise exception 'INVALID_RENEWAL';end if;
 if exists(select 1 from public.nova_platform_renewal_receipts where source_application_id=p_source_id
  and (consent->>'accepted_at')::timestamptz >= (p_consent->>'accepted_at')::timestamptz) then raise exception 'STALE_RENEWAL';end if;
 perform 1 from public.nova_platform_jobs where application_id=p_application_id for update;
 if (select count(*) from public.nova_platform_jobs where application_id=p_application_id and source_application_id=p_source_id and payload_hash=p_payload_hash)<>3 then raise exception 'JOBS_INCOMPLETE';end if;
 select jsonb_agg(jsonb_build_object('id',id,'platform',platform,'status',status,'reason',reason_code,'attempts',attempts,'observation',observation,'checked_at',checked_at))
 into previous from public.nova_platform_jobs where application_id=p_application_id;
 update public.nova_platform_jobs set consent=p_consent,inputs=jsonb_build_object('document',p_inputs->>'document','phone',p_inputs->>'phone'),
 status=case when platform='KREDIYA' then 'blocked' else 'queued' end,
 reason_code=case when platform='KREDIYA' then 'YABOT_TRANSPORT_NOT_VERIFIED' else null end,updated_at=now()
 where application_id=p_application_id and attempts<3 and status in ('blocked','unavailable','waiting_consent')
 and (observation is null or observation->>'availability'='unavailable')
 and (consent is null or (consent->>'accepted_at')::timestamptz<(p_consent->>'accepted_at')::timestamptz)
 and ((platform='KREDIYA' and attempts=0 and completion_lease_id is null and reason_code in ('CONSENT_EXPIRED','PLATFORM_CONSENT_REQUIRED','YABOT_TRANSPORT_NOT_VERIFIED'))
  or (platform in ('PAYJOY','ALO') and reason_code in ('CONSENT_EXPIRED','PLATFORM_CONSENT_REQUIRED','SOURCE_AUTHORIZATION_NOT_CURRENT','PROVIDER_REQUEST_FAILED','PROVIDER_IDENTITY_MISSING','PROVIDER_CUSTOMER_NOT_RETURNED','PROVIDER_HTTP_5XX','PROVIDER_HTTP_TIMEOUT','PROVIDER_TIMEOUT','INVALID_PROVIDER_RESPONSE')));
 get diagnostics n=row_count;
 result:=jsonb_build_object('ok',true,'synced',true,'renewal_id',p_renewal_id,'source_application_id',p_source_id,'eligible_jobs',n,'review_required',3-n);
 insert into public.nova_platform_renewal_receipts values(p_renewal_id,p_source_id,p_consent,previous,result,now());
 return result;
end;$function$;

CREATE OR REPLACE FUNCTION public.nova_claim_platform_jobs(p_platforms text[])
 RETURNS SETOF nova_platform_jobs
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if p_platforms is null or not p_platforms <@ array['PAYJOY','ALO']::text[] then raise exception 'INVALID_READERS';end if;
 -- Expired transient locators are erased even when no connector is enabled.
 update public.nova_platform_jobs set inputs=null,status='blocked',reason_code='CONSENT_EXPIRED',
   lease_id=null,lease_until=null,updated_at=now()
 where inputs is not null and (consent->>'expires_at')::timestamptz<=now();
 update public.nova_platform_jobs set inputs=null,status='blocked',reason_code='RETRY_LIMIT',
   lease_id=null,lease_until=null,updated_at=now()
 where status='running' and lease_until<=now() and attempts>=3;
 return query with due as (
   select j.id from public.nova_platform_jobs j join public.nova_credit_applications a on a.id=j.application_id
   where j.platform=any(p_platforms) and a.store_code ~ '^CK-0[1-9]$' and a.data_consent_granted is true
     and j.inputs is not null and j.attempts<3 and (j.consent->>'expires_at')::timestamptz>now()+interval '90 seconds'
     and (j.status='queued' or (j.status='running' and j.lease_until<=now()))
   order by j.created_at,j.id limit 2 for update of j skip locked
 ) update public.nova_platform_jobs j set status='running',lease_id=gen_random_uuid(),lease_until=now()+interval '90 seconds',
   attempts=j.attempts+1,updated_at=now() from due where j.id=due.id returning j.*;
end;$function$;

CREATE OR REPLACE FUNCTION public.nova_enqueue_platform_jobs(p_application_id uuid, p_payload_hash text, p_inputs jsonb, p_consent jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare receipt public.nova_registration_receipts; app public.nova_credit_applications;
 p text; allowed boolean; prior public.nova_platform_jobs;
begin
 select * into app from public.nova_credit_applications where id=p_application_id for update;
 if not found or app.store_code !~ '^CK-0[1-9]$' or app.data_consent_granted is not true then raise exception 'INVALID_CASE';end if;
 select * into receipt from public.nova_registration_receipts where application_id=p_application_id;
 if not found or receipt.payload_hash is distinct from p_payload_hash then raise exception 'INVALID_RECEIPT';end if;
 allowed:=false;
 if p_consent is not null and p_consent<>'null'::jsonb then
   if (jsonb_typeof(p_consent)='object' and p_consent->'granted'='true'::jsonb
     and p_consent->'revoked'='false'::jsonb and p_consent->>'text_version'='nova-platform-query-v1'
     and jsonb_typeof(p_consent->'platforms')='array') is not true then raise exception 'INVALID_PLATFORM_CONSENT';end if;
   if jsonb_array_length(p_consent->'platforms')<>3 or
     not (p_consent->'platforms' @> '["PAYJOY","KREDIYA","ALO"]'::jsonb) then raise exception 'INVALID_PLATFORMS';end if;
   if ((p_consent->>'accepted_at')::timestamptz<=now()
      and (p_consent->>'expires_at')::timestamptz>(p_consent->>'accepted_at')::timestamptz
      and (p_consent->>'expires_at')::timestamptz<=(p_consent->>'accepted_at')::timestamptz+interval '24 hours') is not true
      then raise exception 'INVALID_PLATFORM_CONSENT';end if;
   allowed:=(p_consent->>'expires_at')::timestamptz>now();
   if allowed and (jsonb_typeof(p_inputs)='object' and p_inputs->>'document' ~ '^[0-9]{6,12}$'
      and p_inputs->>'phone' ~ '^3[0-9]{9}$') is not true then raise exception 'INVALID_INPUTS';end if;
 end if;
 foreach p in array array['PAYJOY','KREDIYA','ALO'] loop
   select * into prior from public.nova_platform_jobs where application_id=p_application_id and platform=p;
   if found then
     if prior.payload_hash<>p_payload_hash or prior.consent is distinct from p_consent then raise exception 'JOB_CONFLICT';end if;
     continue;
   end if;
   insert into public.nova_platform_jobs(application_id,source_application_id,payload_hash,platform,status,inputs,consent,reason_code)
   values(p_application_id,receipt.source_application_id,p_payload_hash,p,
     case when not allowed then 'waiting_consent' when p='KREDIYA' then 'blocked' else 'queued' end,
     case when allowed then jsonb_build_object('document',p_inputs->>'document','phone',p_inputs->>'phone') end,p_consent,
     case when not allowed then 'PLATFORM_CONSENT_REQUIRED' when p='KREDIYA' then 'YABOT_TRANSPORT_NOT_VERIFIED' end);
 end loop;
 return jsonb_build_object('queued',true,'tasks',3);
end;$function$;

CREATE OR REPLACE FUNCTION public.nova_retail_reference_reserve(p_reference uuid, p_source uuid, p_contact_hash text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare attempt uuid:=gen_random_uuid();saved uuid;
begin
 if not exists(select 1 from public.nova_reference_verifications r join public.nova_registration_receipts s on s.application_id=r.application_id join public.nova_credit_applications a on a.id=r.application_id where r.id=p_reference and r.superseded_at is null and not exists(select 1 from public.nova_reference_dialogues x where x.contact_hash=p_contact_hash and x.status='declined') and s.source_application_id=p_source and a.store_code ~ '^CK-0[1-9]$' and r.contact_hash=p_contact_hash and r.consent_status='pending' and r.verification_status='pending' and not exists(select 1 from public.nova_reference_dialogues d where d.reference_id=r.id)) then return null;end if;
 insert into public.nova_retail_reference_dispatch(reference_id,source_id,contact_hash,attempt_id,state) values(p_reference,p_source,p_contact_hash,attempt,'sending')
 on conflict(reference_id) do update set attempt_id=excluded.attempt_id,state='sending',attempts=nova_retail_reference_dispatch.attempts+1,updated_at=now(),provider_message_id=null,error_code=null
 where nova_retail_reference_dispatch.state='failed' and nova_retail_reference_dispatch.attempts<5 and nova_retail_reference_dispatch.next_attempt_at<=now() and nova_retail_reference_dispatch.delivered_at is null
 returning attempt_id into saved;
 if saved is not null then insert into public.nova_retail_reference_dispatch_events(reference_id,status) values(p_reference,'sending');end if;
 return saved;
end $function$;

CREATE OR REPLACE FUNCTION public.nova_retail_replace_reference(p_source uuid, p_old uuid, p_new uuid, p_hash text, p_customer_hash text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.nova_reference_verifications; d public.nova_reference_dialogues; delivered public.nova_retail_reference_dispatch;
begin
 select * into strict r from public.nova_reference_verifications where id=p_old for update;
 if r.superseded_at is not null or (p_hash ~ '^[a-f0-9]{64}$') is not true or p_hash in (r.contact_hash,p_customer_hash) then raise exception 'INVALID_REPLACEMENT';end if;
 if not exists(select 1 from public.nova_registration_receipts s join public.nova_credit_applications a on a.id=s.application_id where s.application_id=r.application_id and s.source_application_id=p_source and a.store_code ~ '^CK-0[1-9]$') then raise exception 'OUT_OF_SCOPE';end if;
 select * into d from public.nova_reference_dialogues where reference_id=p_old;
 select * into delivered from public.nova_retail_reference_dispatch where reference_id=p_old;
 if d.status='completed' or d.outcome='does_not_know' then raise exception 'REVIEW_REQUIRED';end if;
 if (coalesce(d.status='declined',false) or coalesce(delivered.delivered_at<=now()-interval '10 minutes',false) or coalesce(delivered.state='failed' and delivered.attempts>=5,false) or exists(select 1 from public.nova_reference_dialogues x where x.contact_hash=r.contact_hash and x.status='declined')) is not true then raise exception 'WAIT_FOR_REFERENCE';end if;
 if exists(select 1 from public.nova_reference_verifications where application_id=r.application_id and superseded_at is null and contact_hash=p_hash) then raise exception 'DUPLICATE_REFERENCE';end if;
 if exists(select 1 from public.nova_reference_dialogues where contact_hash=p_hash and status='declined') then raise exception 'CONTACT_DECLINED';end if;
 update public.nova_reference_verifications set superseded_at=now(),updated_at=now() where id=p_old;
 update public.nova_reference_dialogues set status='stopped',updated_at=now() where reference_id=p_old and status='active';
 update public.nova_retail_reference_dispatch set state='cancelled',updated_at=now() where reference_id=p_old and state in ('sending','accepted','sent','failed');
 insert into public.nova_reference_verifications(id,application_id,reference_type,contact_hash,consent_status,verification_status,attempts) values(p_new,r.application_id,r.reference_type,p_hash,'pending','pending',0);
 return p_new;
end $function$;

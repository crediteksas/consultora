CREATE OR REPLACE FUNCTION public.nova_enqueue_platform_jobs(p_application_id uuid, p_payload_hash text, p_inputs jsonb, p_consent jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare receipt public.nova_registration_receipts; app public.nova_credit_applications;
 p text; allowed boolean; prior public.nova_platform_jobs;
begin
 select * into app from public.nova_credit_applications where id=p_application_id for update;
 if not found or app.store_code !~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C)$' or app.data_consent_granted is not true then raise exception 'INVALID_CASE';end if;
 select * into receipt from public.nova_registration_receipts where application_id=p_application_id;
 if not found or receipt.payload_hash is distinct from p_payload_hash then raise exception 'INVALID_RECEIPT';end if;
 allowed:=false;
 if p_consent is not null and p_consent<>'null'::jsonb then
   if (jsonb_typeof(p_consent)='object' and p_consent->'granted'='true'::jsonb
     and p_consent->'revoked'='false'::jsonb and p_consent->>'text_version' in ('nova-platform-query-v1','nova-platform-query-v2')
     and jsonb_typeof(p_consent->'platforms')='array') is not true then raise exception 'INVALID_PLATFORM_CONSENT';end if;
   if jsonb_array_length(p_consent->'platforms')<>3 or
     not (p_consent->'platforms' @> '["PAYJOY","KREDIYA","ALO"]'::jsonb) then raise exception 'INVALID_PLATFORMS';end if;
   if ((p_consent->>'accepted_at')::timestamptz<=now()
      and (p_consent->>'expires_at')::timestamptz>(p_consent->>'accepted_at')::timestamptz
      and (p_consent->>'expires_at')::timestamptz<=(p_consent->>'accepted_at')::timestamptz+case p_consent->>'text_version' when 'nova-platform-query-v2' then interval '360 hours' else interval '24 hours' end) is not true
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
end;$function$

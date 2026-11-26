CREATE OR REPLACE FUNCTION public.nova_accept_platform_renewal(p_renewal_id uuid, p_source_id uuid, p_application_id uuid, p_payload_hash text, p_consent jsonb, p_inputs jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare previous jsonb; result jsonb; n integer; old public.nova_platform_renewal_receipts;
begin
 perform 1 from public.nova_credit_applications a join public.nova_registration_receipts r on r.application_id=a.id
 where a.id=p_application_id and a.store_code ~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C|ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B)$' and a.data_consent_granted=true
 and r.source_application_id=p_source_id and r.payload_hash=p_payload_hash for update of a;
 if not found then raise exception 'INVALID_RECEIPT';end if;
 select * into old from public.nova_platform_renewal_receipts where renewal_id=p_renewal_id;
 if found then
  if old.source_application_id<>p_source_id or old.consent is distinct from p_consent then raise exception 'RENEWAL_CONFLICT';end if;
  return old.result;
 end if;
 if p_renewal_id is null or (p_consent->'granted'='true'::jsonb and p_consent->'revoked'='false'::jsonb
  and p_consent->>'text_version' in ('nova-platform-query-v1','nova-platform-query-v2') and jsonb_array_length(p_consent->'platforms')=3
  and p_consent->'platforms' @> '["PAYJOY","KREDIYA","ALO"]'::jsonb
  and (p_consent->>'accepted_at')::timestamptz<=now() and (p_consent->>'expires_at')::timestamptz>now()+interval '3 minutes'
  and (p_consent->>'expires_at')::timestamptz<=(p_consent->>'accepted_at')::timestamptz+case p_consent->>'text_version' when 'nova-platform-query-v2' then interval '360 hours' else interval '24 hours' end
  and p_inputs->>'document' ~ '^[0-9]{6,12}$' and p_inputs->>'phone' ~ '^3[0-9]{9}$') is not true then raise exception 'INVALID_RENEWAL';end if;
 if exists(select 1 from public.nova_platform_renewal_receipts where source_application_id=p_source_id
  and (consent->>'accepted_at')::timestamptz >= (p_consent->>'accepted_at')::timestamptz) then raise exception 'STALE_RENEWAL';end if;
 perform 1 from public.nova_platform_jobs where application_id=p_application_id for update;
 if (select count(*) from public.nova_platform_jobs where application_id=p_application_id and source_application_id=p_source_id and payload_hash=p_payload_hash)<>3 then raise exception 'JOBS_INCOMPLETE';end if;
 select jsonb_agg(jsonb_build_object('id',id,'platform',platform,'status',status,'reason',reason_code,'attempts',attempts,'observation',observation,'checked_at',checked_at))
 into previous from public.nova_platform_jobs where application_id=p_application_id;
 update public.nova_platform_jobs set consent=p_consent,inputs=jsonb_build_object('document',p_inputs->>'document','phone',p_inputs->>'phone'),
 attempts=case when (platform='PAYJOY' and status='unavailable' and reason_code='PROVIDER_CUSTOMER_NOT_RETURNED' and p_consent->>'text_version'='nova-platform-query-v2') then 0 else attempts end,
 status=case when platform='KREDIYA' then 'blocked' else 'queued' end,
 reason_code=case when platform='KREDIYA' then 'YABOT_TRANSPORT_NOT_VERIFIED' else null end,updated_at=now()
 where application_id=p_application_id and (attempts<3 or (platform='PAYJOY' and status='unavailable' and reason_code='PROVIDER_CUSTOMER_NOT_RETURNED' and p_consent->>'text_version'='nova-platform-query-v2')) and status in ('blocked','unavailable','waiting_consent')
 and (observation is null or observation->>'availability'='unavailable')
 and (consent is null or (consent->>'accepted_at')::timestamptz<(p_consent->>'accepted_at')::timestamptz)
 and ((platform='KREDIYA' and attempts=0 and completion_lease_id is null and reason_code in ('CONSENT_EXPIRED','PLATFORM_CONSENT_REQUIRED','YABOT_TRANSPORT_NOT_VERIFIED'))
  or (platform in ('PAYJOY','ALO') and reason_code in ('CONSENT_EXPIRED','PLATFORM_CONSENT_REQUIRED','SOURCE_AUTHORIZATION_NOT_CURRENT','PROVIDER_REQUEST_FAILED','PROVIDER_IDENTITY_MISSING','PROVIDER_CUSTOMER_NOT_RETURNED','PROVIDER_HTTP_5XX','PROVIDER_HTTP_TIMEOUT','PROVIDER_TIMEOUT','INVALID_PROVIDER_RESPONSE')));
 get diagnostics n=row_count;
 result:=jsonb_build_object('ok',true,'synced',true,'renewal_id',p_renewal_id,'source_application_id',p_source_id,'eligible_jobs',n,'review_required',3-n);
 insert into public.nova_platform_renewal_receipts values(p_renewal_id,p_source_id,p_consent,previous,result,now());
 return result;
end;$function$

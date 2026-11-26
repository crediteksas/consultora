CREATE OR REPLACE FUNCTION public.nova_retail_requery(p_source uuid, p_request uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare app uuid;
begin
 select r.application_id into app from public.nova_registration_receipts r join public.nova_credit_applications a on a.id=r.application_id where r.source_application_id=p_source and a.store_code ~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C|ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B)$' and a.data_consent_granted;
 if app is null then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended('retail-requery:'||app::text,0));
 if exists(select 1 from public.nova_platform_jobs where application_id=app and retail_batch_id=p_request) then return true;end if;
 if exists(select 1 from public.nova_platform_jobs where application_id=app and status='running' and lease_until>now()) then return false;end if;
 update public.nova_platform_jobs set retail_batch_id=p_request,status=case when consent->'granted'='true'::jsonb and (consent->>'expires_at')::timestamptz>now() then 'queued' else 'waiting_consent' end,observation=null,checked_at=null,lease_id=null,lease_until=null,completion_lease_id=null,attempts=0,reason_code=case when consent->'granted'='true'::jsonb and (consent->>'expires_at')::timestamptz>now() then null else 'PLATFORM_CONSENT_REQUIRED' end,updated_at=now() where application_id=app;
 return found;
end $function$

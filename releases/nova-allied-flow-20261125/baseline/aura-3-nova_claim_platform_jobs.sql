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
 where (inputs is not null or status in ('queued','running','waiting_consent')) and (consent->>'expires_at')::timestamptz<=now();
 update public.nova_platform_jobs set inputs=null,status='blocked',reason_code='RETRY_LIMIT',
   lease_id=null,lease_until=null,updated_at=now()
 where status='running' and lease_until<=now() and attempts>=3;
 return query with due as (
   select j.id from public.nova_platform_jobs j join public.nova_credit_applications a on a.id=j.application_id
   where j.platform=any(p_platforms) and a.store_code ~ '^(CK-0[1-9]|distritoys)$' and a.data_consent_granted is true
     and j.inputs is not null and j.attempts<3 and (j.consent->>'expires_at')::timestamptz>now()+interval '90 seconds'
     and (j.status='queued' or (j.status='running' and j.lease_until<=now()))
   order by j.created_at,j.id limit 2 for update of j skip locked
 ) update public.nova_platform_jobs j set status='running',lease_id=gen_random_uuid(),lease_until=now()+interval '90 seconds',
   attempts=j.attempts+1,updated_at=now() from due where j.id=due.id returning j.*;
end;$function$

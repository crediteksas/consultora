CREATE OR REPLACE FUNCTION public.nova_claim_krediya_test_job(p_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare job public.nova_platform_jobs;
begin
 if p_application_id is null then return null;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('NOVA:KREDIYA:CHANNEL',0));
 -- Resume the SAME lease only. Never reclaim/re-send a possibly sent job.
 select * into job from public.nova_platform_jobs where platform='KREDIYA' and status='running';
 if found then
  if job.application_id=p_application_id then return to_jsonb(job);end if;
  return null;
 end if;
 select j.* into job from public.nova_platform_jobs j
 join public.nova_credit_applications a on a.id=j.application_id
 join public.nova_registration_receipts r on r.application_id=j.application_id
 where j.application_id=p_application_id and j.platform='KREDIYA' and j.status='blocked' and j.reason_code='YABOT_TRANSPORT_NOT_VERIFIED'
 and j.attempts=0 and j.inputs is not null and j.payload_hash=r.payload_hash
 and j.source_application_id=r.source_application_id and a.store_code='CK-02' and a.data_consent_granted is true
 and j.consent->'granted'='true'::jsonb and j.consent->'revoked'='false'::jsonb
 and (j.consent->>'expires_at')::timestamptz>now()+interval '3 minutes'
 order by j.created_at,j.id limit 1 for update of j skip locked;
 if not found then return null;end if;
 update public.nova_platform_jobs set status='running',reason_code=null,attempts=1,lease_id=gen_random_uuid(),
 lease_until=now()+interval '3 minutes',updated_at=now() where id=job.id returning * into job;
 return to_jsonb(job);
end;$function$

-- Only the existing native connector service may restart its own expired execution.
CREATE FUNCTION public.nova_restart_expired_krediya_job(p_id uuid,p_lease_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $function$
declare j public.nova_platform_jobs;
begin
 if extract(hour from now() at time zone 'America/Bogota')<8 or extract(hour from (now()+interval '5 minutes') at time zone 'America/Bogota')>=20 then return null;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('NOVA:KREDIYA:CHANNEL',0));
 select q.* into j from public.nova_platform_jobs q
 join public.nova_credit_applications a on a.id=q.application_id
 join public.nova_registration_receipts r on r.application_id=q.application_id and r.payload_hash=q.payload_hash and r.source_application_id=q.source_application_id
 where q.id=p_id and q.platform='KREDIYA' and q.status='running' and q.lease_id=p_lease_id
 and q.observation is null and q.checked_at is null and q.completion_lease_id is null
 and q.attempts between 1 and 3 and q.lease_until is not null
 and a.store_code in ('CK-01','CK-02','CK-03','CK-04','CK-05','CK-06','CK-07','CK-08','CK-09','distritoys','club-seven','ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C','ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B')
 and a.data_consent_granted is true
 and q.inputs->>'document' ~ '^[0-9]{6,12}$' and q.inputs->>'phone' ~ '^3[0-9]{9}$'
 and q.consent->'granted'='true'::jsonb and q.consent->'revoked'='false'::jsonb
 and q.consent->>'text_version' in ('nova-platform-query-v1','nova-platform-query-v2')
 and q.consent->'platforms' @> '["PAYJOY","KREDIYA","ALO"]'::jsonb
 and jsonb_array_length(case when jsonb_typeof(q.consent->'platforms')='array' then q.consent->'platforms' else '[]'::jsonb end)=3
 and (q.consent->>'accepted_at')::timestamptz<=now()
 and (q.consent->>'expires_at')::timestamptz>now()+interval '6 minutes'
 and (q.consent->>'expires_at')::timestamptz<=(q.consent->>'accepted_at')::timestamptz+case q.consent->>'text_version' when 'nova-platform-query-v2' then interval '360 hours' else interval '24 hours' end
 and exists(select 1 from public.nova_krediya_browser_channel c where c.work_line='573118657153' and c.job_id=q.id and c.lease_id=p_lease_id and c.released_at is null)
 for update of q;
 if not found then return null;end if;
 -- Idempotent recovery of an already extended execution never adds time or attempts.
 if j.lease_until>now() then
  if j.attempts>=2 then return to_jsonb(j);end if;
  return null;
 end if;
 if j.lease_until>now()-interval '1 minute' or j.attempts>=3 then return null;end if;
 update public.nova_platform_jobs set attempts=attempts+1,lease_until=now()+interval '5 minutes',updated_at=now() where id=j.id returning * into j;
 return to_jsonb(j);
end;$function$;
REVOKE ALL ON FUNCTION public.nova_restart_expired_krediya_job(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nova_restart_expired_krediya_job(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.nova_next_krediya_browser_job(p_claim boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare j public.nova_platform_jobs;
begin
 if exists(select 1 from public.nova_krediya_browser_channel where released_at is null) then return case when p_claim then null else jsonb_build_object('eligible',false) end;end if;
 if p_claim then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('NOVA:KREDIYA:CHANNEL',0));
  if exists(select 1 from public.nova_krediya_browser_channel where released_at is null) or exists(select 1 from public.nova_platform_jobs where platform='KREDIYA' and status='running') or exists(select 1 from public.nova_krediya_diagnostic_sessions where status='running') then return null;end if;
 end if;
 select q.* into j from public.nova_platform_jobs q
 join public.nova_credit_applications a on a.id=q.application_id
 join public.nova_registration_receipts r on r.application_id=q.application_id
 where q.platform='KREDIYA' and q.status='blocked' and ((q.reason_code='YABOT_TRANSPORT_NOT_VERIFIED' and q.attempts=0) or (q.reason_code='KREDIYA_PAYMENT_HISTORY_REQUIRED' and q.attempts between 1 and 2)) and q.inputs is not null and q.payload_hash=r.payload_hash and q.source_application_id=r.source_application_id
 and a.store_code in ('CK-01','CK-02','CK-03','CK-04','CK-05','CK-06','CK-07','CK-08','CK-09','distritoys','club-seven','ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C','ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B') and a.data_consent_granted is true
 and q.inputs->>'document' ~ '^[0-9]{6,12}$' and q.inputs->>'phone' ~ '^3[0-9]{9}$'
 and q.consent->'granted'='true'::jsonb and q.consent->'revoked'='false'::jsonb
 and q.consent->>'text_version' in ('nova-platform-query-v1','nova-platform-query-v2')
 and q.consent->'platforms' @> '["PAYJOY","KREDIYA","ALO"]'::jsonb and jsonb_array_length(case when jsonb_typeof(q.consent->'platforms')='array' then q.consent->'platforms' else '[]'::jsonb end)=3
 and (q.consent->>'accepted_at')::timestamptz<=now()
 and (q.consent->>'expires_at')::timestamptz>now()+interval '6 minutes'
 and (q.consent->>'expires_at')::timestamptz<=(q.consent->>'accepted_at')::timestamptz+case q.consent->>'text_version' when 'nova-platform-query-v2' then interval '360 hours' else interval '24 hours' end
 order by q.created_at,q.id limit 1 for update of q skip locked;
 if not p_claim then return jsonb_build_object('eligible',found);end if;
 if not found then return null;end if;
 update public.nova_platform_jobs set status='running',reason_code=null,attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',updated_at=now() where id=j.id returning * into j;
 insert into public.nova_krediya_browser_channel(work_line,job_id,lease_id) values('573118657153',j.id,j.lease_id);
 return to_jsonb(j);
end;$function$

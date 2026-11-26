CREATE OR REPLACE FUNCTION public.nova_payjoy_retry_eligible(p_job nova_platform_jobs)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
 if p_job.platform is distinct from 'PAYJOY' or p_job.status is distinct from 'unavailable'
  or p_job.attempts not between 1 and 2 or p_job.checked_at is null or p_job.lease_id is not null
  or p_job.checked_at>now()-(case when p_job.attempts=1 then interval '5 minutes' else interval '10 minutes' end)
  or (p_job.reason_code=any(array['PROVIDER_CUSTOMER_NOT_RETURNED','PROVIDER_TIMEOUT','PROVIDER_UNAVAILABLE','PROVIDER_HTTP_TIMEOUT','PROVIDER_HTTP_429','PROVIDER_HTTP_5XX'])) is not true
  then return false;end if;
 if (p_job.consent->'granted'='true'::jsonb and p_job.consent->'revoked'='false'::jsonb
  and p_job.consent->>'text_version' in ('nova-platform-query-v1','nova-platform-query-v2')
  and jsonb_typeof(p_job.consent->'platforms')='array') is not true then return false;end if;
 if jsonb_array_length(p_job.consent->'platforms')<>3 or not(p_job.consent->'platforms' @> '["PAYJOY","ALO","KREDIYA"]'::jsonb) then return false;end if;
 if (((p_job.consent->>'accepted_at')::timestamptz<=now())
  and (p_job.consent->>'expires_at')::timestamptz>now()+interval '90 seconds'
  and (p_job.consent->>'expires_at')::timestamptz<=(p_job.consent->>'accepted_at')::timestamptz+case p_job.consent->>'text_version' when 'nova-platform-query-v2' then interval '360 hours' else interval '24 hours' end) is not true then return false;end if;
 return exists(select 1 from public.nova_credit_applications a where a.id=p_job.application_id and a.store_code ~ '^(CK-0[1-9]|distritoys)$' and a.data_consent_granted is true)
  and (select count(*)<2 from public.nova_payjoy_retry_events e where e.job_id=p_job.id and e.retry_batch=coalesce(p_job.retail_batch_id::text,'initial') and e.consent_fingerprint=md5(p_job.consent::text))
  and not exists(select 1 from public.nova_payjoy_retry_events e where e.job_id=p_job.id and e.retry_batch=coalesce(p_job.retail_batch_id::text,'initial') and e.consent_fingerprint=md5(p_job.consent::text) and e.previous_attempts=p_job.attempts);
exception when invalid_datetime_format or datetime_field_overflow then return false;
end $function$

-- AURA only. Operational notices never update credit cases, provider jobs or decisions.
create table public.nova_platform_delay_alerts (
 id uuid primary key default gen_random_uuid(),
 source_id uuid not null,
 batch_id uuid,
 cycle_key text generated always as (coalesce(batch_id::text,'initial')) stored,
 started_at timestamptz not null,
 job_ids uuid[] not null check(cardinality(job_ids) between 1 and 3),
 recipient text not null check(recipient ~ '^573[0-9]{9}$'),
 state text not null check(state in ('sending','accepted','delivered','read','failed','uncertain','cancelled','suppressed')),
 attempts integer not null default 1 check(attempts between 1 and 3),
 attempt_id uuid not null,
 attempted_at timestamptz not null default now(),
 next_attempt_at timestamptz not null default now(),
 provider_message_id text unique,
 delivered_at timestamptz, read_at timestamptz,
 error_code text, last_provider_status text, last_provider_at timestamptz,
 created_at timestamptz not null default now(),
 unique(source_id,cycle_key)
);
alter table public.nova_platform_delay_alerts enable row level security;
revoke all on table public.nova_platform_delay_alerts from public,anon,authenticated;
grant select,insert,update on table public.nova_platform_delay_alerts to service_role;
comment on table public.nova_platform_delay_alerts is 'Private technical-delay delivery receipts. No end-user policies; no credit or job writes.';

create function public.nova_platform_delay_claim(p_source uuid,p_batch uuid,p_started timestamptz,p_recipient text,p_jobs uuid[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.nova_registration_receipts%rowtype; j public.nova_platform_jobs%rowtype;
 n public.nova_platform_delay_alerts%rowtype; accepted timestamptz; expires timestamptz; v integer; origin text;
begin
 -- [08:00,20:00) Colombia. No historical (>24h) or cross-day morning backfill.
 if extract(hour from now() at time zone 'America/Bogota') not between 8 and 19
 or p_started is null or extract(hour from p_started at time zone 'America/Bogota') not between 8 and 19 or p_started>now()-interval '120 seconds'
 or p_started<date_trunc('day',now() at time zone 'America/Bogota') at time zone 'America/Bogota'
 or p_recipient !~ '^573[0-9]{9}$' or p_recipient is null
 or cardinality(p_jobs) not between 1 and 3 or p_jobs is null then return null;end if;
 select * into r from public.nova_registration_receipts where source_application_id=p_source;
 if not found then return null;end if;
 select a.store_code into origin from public.nova_credit_applications a where a.id=r.application_id and a.data_consent_granted;
 if origin is null then return null;end if;
 -- All provider jobs must still belong to this exact receipt and current cycle.
 if (select count(*) from public.nova_platform_jobs where application_id=r.application_id)<>3
 or exists(select 1 from public.nova_platform_jobs where application_id=r.application_id and (source_application_id is distinct from p_source or payload_hash is distinct from r.payload_hash or retail_batch_id is distinct from p_batch)) then return null;end if;
 if (select count(*) from public.nova_platform_jobs where id=any(p_jobs) and application_id=r.application_id)<>cardinality(p_jobs) then return null;end if;
 if p_batch is null and (select date_trunc('milliseconds',min(created_at)) from public.nova_platform_jobs where id=any(p_jobs)) is distinct from p_started then return null;end if;
 for j in select * from public.nova_platform_jobs where id=any(p_jobs) loop
  if j.status not in ('queued','running','blocked') or j.checked_at is not null or j.platform not in ('ALO','KREDIYA','PAYJOY') or j.consent->'granted' is distinct from 'true'::jsonb or j.consent->'revoked' is distinct from 'false'::jsonb or j.consent->>'text_version' is null or j.consent->>'text_version' not in ('nova-platform-query-v1','nova-platform-query-v2') or jsonb_typeof(j.consent->'platforms') is distinct from 'array' then return null;end if;
  if jsonb_array_length(j.consent->'platforms')<>3 or not (j.consent->'platforms' @> '["ALO","KREDIYA","PAYJOY"]'::jsonb) then return null;end if;
  begin accepted:=(j.consent->>'accepted_at')::timestamptz;expires:=(j.consent->>'expires_at')::timestamptz;exception when others then return null;end;
  if accepted is null or expires is null or accepted>now() or expires<=now() or expires<=accepted or expires-accepted>(case when j.consent->>'text_version'='nova-platform-query-v2' then interval '15 days' else interval '1 day' end) then return null;end if;
 end loop;
 insert into public.nova_platform_delay_alerts(source_id,batch_id,started_at,job_ids,recipient,state,attempt_id)
 values(p_source,p_batch,p_started,p_jobs,p_recipient,'sending',gen_random_uuid())
 on conflict(source_id,cycle_key) do nothing returning * into n;
 if found then return to_jsonb(n);end if;
 -- Only notice rows are locked. There are no locks/writes on jobs, receipts or cases.
 select * into n from public.nova_platform_delay_alerts where source_id=p_source and batch_id is not distinct from p_batch for update skip locked;
 if not found then return null;end if;
 -- 120s > 35s scan timeout + 8s Meta timeout. Never automatically replay uncertainty.
 if n.state='sending' and n.attempted_at<now()-interval '120 seconds' then
  update public.nova_platform_delay_alerts set state='uncertain',error_code='STALE_SEND_UNCONFIRMED' where id=n.id;
  return null;
 end if;
 if n.state<>'failed' or n.attempts>=3 or n.next_attempt_at>now() or n.provider_message_id is not null or n.recipient<>p_recipient then return null;end if;
 update public.nova_platform_delay_alerts set state='sending',attempts=attempts+1,attempt_id=gen_random_uuid(),attempted_at=now(),job_ids=p_jobs,error_code=null where id=n.id returning * into n;
 return to_jsonb(n);
end $$;

create function public.nova_platform_delay_finish(p_id uuid,p_attempt uuid,p_state text,p_message text,p_error text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_state not in ('accepted','failed','uncertain','cancelled') or p_state is null or p_state='accepted' and (p_message is null or length(p_message)>250 or length(p_message)<1) or p_state<>'accepted' and p_message is not null then return false;end if;
 update public.nova_platform_delay_alerts set state=p_state,provider_message_id=p_message,error_code=left(p_error,100),next_attempt_at=now()+interval '5 minutes'
 where id=p_id and attempt_id=p_attempt and state='sending';
 return found;
end $$;

create function public.nova_platform_delay_status(p_message text,p_recipient text,p_status text,p_at timestamptz,p_error text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_status not in ('sent','delivered','read','failed') or p_status is null or p_at is null or p_at>now()+interval '60 seconds' then return false;end if;
 update public.nova_platform_delay_alerts set
 state=case when state='read' then 'read' when p_status='read' then 'read' when state='delivered' or p_status='delivered' then 'delivered' else 'accepted' end,
 delivered_at=case when p_status in ('delivered','read') then coalesce(delivered_at,p_at) else delivered_at end,
 read_at=case when p_status='read' then coalesce(read_at,p_at) else read_at end,
 last_provider_status=case when last_provider_at is null or p_at>=last_provider_at then p_status else last_provider_status end,
 last_provider_at=greatest(last_provider_at,p_at),
 error_code=case when p_status='failed' then left(p_error,100) else error_code end
 where provider_message_id=p_message and recipient=p_recipient and p_at>=attempted_at-interval '60 seconds' and state in ('accepted','delivered','read','uncertain');
 -- A late failed delivery is recorded only, never queued for resend.
 return found;
end $$;

revoke all on function public.nova_platform_delay_claim(uuid,uuid,timestamptz,text,uuid[]) from public,anon,authenticated;
revoke all on function public.nova_platform_delay_finish(uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.nova_platform_delay_status(text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.nova_platform_delay_claim(uuid,uuid,timestamptz,text,uuid[]) to service_role;
grant execute on function public.nova_platform_delay_finish(uuid,uuid,text,text,text) to service_role;
grant execute on function public.nova_platform_delay_status(text,text,text,timestamptz,text) to service_role;

-- Bounded queue excludes notices already sent/uncertain, preventing an old held job
-- from starving a new source. Requeries are validated against KORA before claim/send.
create function public.nova_platform_delay_candidates(p_activation timestamptz)
returns table(source_id uuid,batch_id uuid) language sql stable security invoker set search_path='' as $$
 select j.source_application_id,j.retail_batch_id from public.nova_platform_jobs j
 left join public.nova_platform_delay_alerts n on n.source_id=j.source_application_id and n.batch_id is not distinct from j.retail_batch_id
 where p_activation is not null and p_activation<=now()
 and j.status in ('queued','running','blocked') and j.checked_at is null
 and (case when j.retail_batch_id is null then j.created_at else j.updated_at end)>=greatest(p_activation,(date_trunc('day',now() at time zone 'America/Bogota')+interval '8 hours') at time zone 'America/Bogota',now()-interval '24 hours')
 and (j.retail_batch_id is not null or j.created_at<=now()-interval '120 seconds')
 and extract(hour from (case when j.retail_batch_id is null then j.created_at else j.updated_at end) at time zone 'America/Bogota') between 8 and 19
 and (n.id is null or n.state='failed' and n.attempts<3 and n.next_attempt_at<=now() or n.state='sending' and n.attempted_at<now()-interval '120 seconds')
 group by j.source_application_id,j.retail_batch_id order by min(case when j.retail_batch_id is null then j.created_at else j.updated_at end) desc,j.source_application_id limit 10;
$$;
revoke all on function public.nova_platform_delay_candidates(timestamptz) from public,anon,authenticated;
grant execute on function public.nova_platform_delay_candidates(timestamptz) to service_role;

-- Terminal operational suppression only; no FK or locks/writes on source records.
create function public.nova_platform_delay_suppress(p_source uuid,p_batch uuid,p_recipient text,p_reason text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare ids uuid[]; started timestamptz;
begin
 if p_recipient is null or p_recipient !~ '^573[0-9]{9}$' or p_reason is null or p_reason not in ('SOURCE_NOT_ELIGIBLE','NO_CURRENT_SERVICE_DELAY') then return false;end if;
 select array_agg(id order by id),min(created_at) into ids,started from public.nova_platform_jobs where source_application_id=p_source and retail_batch_id is not distinct from p_batch;
 if cardinality(ids) not between 1 and 3 or ids is null then return false;end if;
 insert into public.nova_platform_delay_alerts(source_id,batch_id,started_at,job_ids,recipient,state,attempt_id,error_code)
 values(p_source,p_batch,started,ids,p_recipient,'suppressed',gen_random_uuid(),p_reason)
 on conflict(source_id,cycle_key) do nothing;
 return found;
end $$;
revoke all on function public.nova_platform_delay_suppress(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.nova_platform_delay_suppress(uuid,uuid,text,text) to service_role;

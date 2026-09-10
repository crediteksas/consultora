-- Delivery only. No historical backfill, recalculation, approvals or payment mutations.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create table kora_private.krediya_mail_jobs (
 liquidation_id uuid primary key references public.krediya_import_reports(liquidation_id) on delete cascade,
 token uuid not null default gen_random_uuid(),
 status text not null default 'pending' check(status in ('pending','sending','sent','retry','ambiguous','failed')),
 attempts integer not null default 0,
 due_at timestamptz not null default now(),
 claimed_at timestamptz,
 last_dispatch_at timestamptz,
 request_id bigint
);
alter table kora_private.krediya_mail_jobs enable row level security;
revoke all on kora_private.krediya_mail_jobs from public,anon,authenticated;
grant usage on schema kora_private to service_role;
grant all on kora_private.krediya_mail_jobs to service_role;
create policy krediya_mail_service on kora_private.krediya_mail_jobs to service_role using(true) with check(true);

create function kora_private.enqueue_krediya_mail() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.report_status='preparado' then
  begin
   insert into kora_private.krediya_mail_jobs(liquidation_id) values(new.liquidation_id) on conflict do nothing;
   update public.krediya_import_reports set email_status='pendiente' where liquidation_id=new.liquidation_id;
  exception when others then
   -- Report failure cannot roll back the import transaction.
   raise warning 'Krediya mail enqueue failed: %',sqlstate;
  end;
 end if;
 return new;
end $$;
revoke all on function kora_private.enqueue_krediya_mail() from public,anon,authenticated;
create trigger enqueue_krediya_mail after insert on public.krediya_import_reports
 for each row execute function kora_private.enqueue_krediya_mail();

-- The edge endpoint authenticates a random single-use per-job capability through this
-- service-only, SECURITY INVOKER RPC. It never trusts a client-supplied report or recipient.
create function public.kora_claim_krediya_mail(p_id uuid,p_token uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_id uuid;v_report jsonb;
begin
 update kora_private.krediya_mail_jobs set status='sending',attempts=attempts+1,claimed_at=now()
 where liquidation_id=p_id and token=p_token and status in ('pending','retry') and due_at<=now()
 returning liquidation_id into v_id;
 if v_id is null then return null; end if;
 select to_jsonb(r) into v_report from public.krediya_import_reports r where r.liquidation_id=v_id;
 return v_report;
end $$;
revoke all on function public.kora_claim_krediya_mail(uuid,uuid) from public,anon,authenticated;
grant execute on function public.kora_claim_krediya_mail(uuid,uuid) to service_role;

create function public.kora_finish_krediya_mail(p_id uuid,p_token uuid,p_outcome text,p_message_id text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_attempts integer;
begin
 if p_outcome not in ('sent','retry','ambiguous','failed') or
  (p_outcome='sent' and (p_message_id is null or p_message_id !~ '^[a-zA-Z0-9_-]{1,200}$')) then
  raise exception 'Invalid mail outcome';
 end if;
 select attempts into v_attempts from kora_private.krediya_mail_jobs
 where liquidation_id=p_id and token=p_token and status='sending' for update;
 if not found then return false;end if;
 if p_outcome='retry' and v_attempts>=5 then p_outcome:='failed';end if;
 update kora_private.krediya_mail_jobs set status=p_outcome,
 due_at=now()+interval '5 minutes',token=gen_random_uuid() where liquidation_id=p_id;
 update public.krediya_import_reports set
 email_status=case when p_outcome='sent' then 'enviado' when p_outcome='retry' then 'pendiente' else 'error' end,
 email_sent_at=case when p_outcome='sent' then now() else null end,
 provider_message_id=case when p_outcome='sent' then p_message_id else null end,
 error_code=case when p_outcome='sent' then null else 'mail_'||p_outcome end
 where liquidation_id=p_id;
 return true;
end $$;
revoke all on function public.kora_finish_krediya_mail(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.kora_finish_krediya_mail(uuid,uuid,text,text) to service_role;

create function kora_private.dispatch_krediya_mail() returns void
language plpgsql security definer set search_path='' as $$
declare j record;v_request bigint;
begin
 -- A process crash after starting Gmail may already have sent the email. Never resend blindly.
 with expired as (
  update kora_private.krediya_mail_jobs set status='ambiguous'
  where status='sending' and claimed_at<now()-interval '10 minutes' returning liquidation_id
 ) update public.krediya_import_reports set email_status='error',error_code='mail_ambiguous'
 where liquidation_id in(select liquidation_id from expired);
 for j in select * from kora_private.krediya_mail_jobs
 where status in('pending','retry') and due_at<=now()
 and (last_dispatch_at is null or last_dispatch_at<now()-interval '2 minutes')
 order by due_at limit 10 for update skip locked loop
  begin
   select net.http_post(
    url:='https://jfkmiyvcdfbsbwchyvol.supabase.co/functions/v1/krediya-report-mail',
    headers:='{"Content-Type":"application/json"}'::jsonb,
    body:=jsonb_build_object('id',j.liquidation_id,'token',j.token),timeout_milliseconds:=60000
   ) into v_request;
   update kora_private.krediya_mail_jobs set last_dispatch_at=now(),request_id=v_request where liquidation_id=j.liquidation_id;
  exception when others then raise warning 'Krediya mail dispatch failed: %',sqlstate;
  end;
 end loop;
end $$;
revoke all on function kora_private.dispatch_krediya_mail() from public,anon,authenticated;
select cron.schedule('kora-krediya-report-mail','* * * * *','select kora_private.dispatch_krediya_mail()');

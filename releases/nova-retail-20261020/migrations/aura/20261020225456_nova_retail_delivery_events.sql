create table public.nova_retail_reference_dispatch (
 reference_id uuid primary key references public.nova_reference_verifications(id),
 source_id uuid not null,
 contact_hash text not null check(contact_hash ~ '^[a-f0-9]{64}$'),
 attempt_id uuid not null default gen_random_uuid(),
 state text not null check(state in ('sending','accepted','sent','delivered','read','failed','uncertain','cancelled')),
 attempts integer not null default 1,
 provider_message_id text,
 error_code integer,
 delivered_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index on public.nova_retail_reference_dispatch(provider_message_id) where provider_message_id is not null;
alter table public.nova_retail_reference_dispatch enable row level security;
revoke all on public.nova_retail_reference_dispatch from public,anon,authenticated;
grant select,insert,update on public.nova_retail_reference_dispatch to service_role;
create table public.nova_retail_reference_dispatch_events (
 id bigint generated always as identity primary key,
 reference_id uuid not null references public.nova_reference_verifications(id),
 status text not null,
 provider_message_id text,
 error_code integer,
 at timestamptz not null default now()
);
alter table public.nova_retail_reference_dispatch_events enable row level security;
revoke all on public.nova_retail_reference_dispatch_events from public,anon,authenticated;
grant select,insert on public.nova_retail_reference_dispatch_events to service_role;
grant usage,select on sequence public.nova_retail_reference_dispatch_events_id_seq to service_role;

create function public.nova_retail_reference_reserve(p_reference uuid,p_source uuid,p_contact_hash text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare attempt uuid:=gen_random_uuid();saved uuid;
begin
 if not exists(select 1 from public.nova_reference_verifications r join public.nova_registration_receipts s on s.application_id=r.application_id join public.nova_credit_applications a on a.id=r.application_id where r.id=p_reference and s.source_application_id=p_source and a.store_code ~ '^CK-0[1-9]$' and r.contact_hash=p_contact_hash and r.consent_status='pending' and r.verification_status='pending' and not exists(select 1 from public.nova_reference_dialogues d where d.reference_id=r.id)) then return null;end if;
 insert into public.nova_retail_reference_dispatch(reference_id,source_id,contact_hash,attempt_id,state) values(p_reference,p_source,p_contact_hash,attempt,'sending')
 on conflict(reference_id) do update set attempt_id=excluded.attempt_id,state='sending',attempts=nova_retail_reference_dispatch.attempts+1,updated_at=now(),provider_message_id=null,error_code=null
 where nova_retail_reference_dispatch.state='failed' and nova_retail_reference_dispatch.attempts<5 and nova_retail_reference_dispatch.next_attempt_at<=now() and nova_retail_reference_dispatch.delivered_at is null
 returning attempt_id into saved;
 if saved is not null then insert into public.nova_retail_reference_dispatch_events(reference_id,status) values(p_reference,'sending');end if;
 return saved;
end $$;
create function public.nova_retail_reference_finish(p_reference uuid,p_attempt uuid,p_state text,p_message_id text,p_error integer)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_state not in ('accepted','failed','uncertain') then raise exception 'INVALID_STATE';end if;
 update public.nova_retail_reference_dispatch set state=p_state,provider_message_id=p_message_id,error_code=p_error,next_attempt_at=now()+interval '1 minute'*least(30,power(2,attempts)),updated_at=now() where reference_id=p_reference and attempt_id=p_attempt and state='sending';
 if not found then return false;end if;
 insert into public.nova_retail_reference_dispatch_events(reference_id,status,provider_message_id,error_code) values(p_reference,p_state,p_message_id,p_error);return true;
end $$;
create function public.nova_retail_reference_status(p_message_id text,p_contact_hash text,p_status text,p_at timestamptz,p_error integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare ref uuid;
begin
 if p_status not in ('sent','delivered','read','failed') or p_at>now()+interval '1 minute' then return false;end if;
 update public.nova_retail_reference_dispatch set state=case when state='read' then state when state='delivered' and p_status in ('failed','sent') then state else p_status end,
 delivered_at=case when p_status in ('delivered','read') then least(coalesce(delivered_at,p_at),p_at) else delivered_at end,error_code=p_error,updated_at=now()
 where provider_message_id=p_message_id and contact_hash=p_contact_hash and p_at>=created_at-interval '1 minute' returning reference_id into ref;
 if ref is null then return false;end if;
 insert into public.nova_retail_reference_dispatch_events(reference_id,status,provider_message_id,error_code,at) values(ref,p_status,p_message_id,p_error,p_at);return true;
end $$;
revoke all on function public.nova_retail_reference_reserve(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.nova_retail_reference_finish(uuid,uuid,text,text,integer) from public,anon,authenticated;
revoke all on function public.nova_retail_reference_status(text,text,text,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.nova_retail_reference_reserve(uuid,uuid,text) to service_role;
grant execute on function public.nova_retail_reference_finish(uuid,uuid,text,text,integer) to service_role;
grant execute on function public.nova_retail_reference_status(text,text,text,timestamptz,integer) to service_role;

-- REVIEW CANDIDATE. Relate a collection event to an existing liquidation, not a fabricated debt.
begin;
-- This draft only supports an exact empty-install rollback from these prerequisites.
-- If explicit INSERT column grants already exist, capture and design their restoration first.
do $$begin
 if not (select relrowsecurity from pg_class where oid='public.credit_collection_events'::regclass) then raise exception 'cobra_event_rls_required'; end if;
 if exists(select 1 from pg_policy where polrelid='public.credit_collection_events'::regclass and polcmd in ('a','*')) then raise exception 'cobra_preexisting_insert_policy_review_required'; end if;
 if not (select attnotnull from pg_attribute where attrelid='public.credit_collection_events'::regclass and attname='obligation_id') then raise exception 'cobra_preexisting_nullable_obligation_review_required'; end if;
 if exists(select 1 from pg_attribute a cross join lateral aclexplode(a.attacl) x where a.attrelid='public.credit_collection_events'::regclass and a.attname in ('obligation_id','actor_type','event_type','channel','note','promise_date','promise_amount','created_by') and x.grantee='authenticated'::regrole and x.privilege_type='INSERT') then raise exception 'cobra_preexisting_column_grants_review_required'; end if;
end$$;
alter table public.credit_collection_events add column operation_id uuid references public.liquidation_operations(id) on delete restrict;
alter table public.credit_collection_events add column client_request_id uuid unique;
alter table public.credit_collection_events alter column obligation_id drop not null;
alter table public.credit_collection_events add constraint credit_collection_event_existing_reference check(obligation_id is not null or operation_id is not null);
create index credit_collection_events_operation_idx on public.credit_collection_events(operation_id,created_at desc) where operation_id is not null;

create function public.cobra_krediya_validate_event()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 -- Legacy RPC remains unchanged. New operation-based events have their own explicit checks.
 if new.operation_id is null then
  if current_user in ('anon','authenticated') then raise exception 'cobra_direct_legacy_event_denied' using errcode='42501'; end if;
  if new.client_request_id is not null then raise exception 'cobra_event_invalid_reference'; end if;
  return new;
 end if;
 if not coalesce(public.cobra_quality_operator(),false) or new.created_by is distinct from auth.uid() or new.actor_type is distinct from 'humano' then raise exception 'cobra_event_not_authorized' using errcode='42501'; end if;
 if new.client_request_id is null or not exists(select 1 from public.cobra_krediya_cut_operations where operation_id=new.operation_id) then raise exception 'cobra_event_without_reviewed_cut'; end if;
 if new.obligation_id is not null and not exists(select 1 from public.credit_portfolio_obligations where id=new.obligation_id and operation_id=new.operation_id) then raise exception 'cobra_event_wrong_obligation'; end if;
 if new.event_type not in ('contact_attempt','contacted','note','promise') or new.event_type is null or new.channel not in ('call','whatsapp','email','platform','internal') or new.channel is null or length(btrim(coalesce(new.note,''))) not between 1 and 600 then raise exception 'cobra_event_invalid_fields'; end if;
 if new.event_type='promise' then
  if new.promise_date is null or new.promise_date<(now() at time zone 'America/Bogota')::date or new.promise_amount is null or new.promise_amount<=0 or new.promise_amount<>trunc(new.promise_amount) or new.promise_amount>90071992547409 then raise exception 'cobra_event_invalid_promise'; end if;
 elsif new.promise_date is not null or new.promise_amount is not null then raise exception 'cobra_event_unexpected_promise';
 end if;
 new.created_at=clock_timestamp();new.note=btrim(new.note);
 return new;
end;
$$;
revoke all on function public.cobra_krediya_validate_event() from public,anon,authenticated,service_role;
create trigger cobra_krediya_validate_event before insert on public.credit_collection_events for each row execute function public.cobra_krediya_validate_event();
grant insert(operation_id,client_request_id,obligation_id,actor_type,event_type,channel,note,promise_date,promise_amount,created_by) on public.credit_collection_events to authenticated;
create policy cobra_quality_events_insert on public.credit_collection_events for insert to authenticated with check(
 (select public.cobra_quality_operator()) and created_by=(select auth.uid()) and actor_type='humano' and operation_id is not null and client_request_id is not null
 and exists(select 1 from public.cobra_krediya_cut_operations c where c.operation_id=credit_collection_events.operation_id));
create policy cobra_quality_events_read on public.credit_collection_events for select to authenticated using(
 (select public.cobra_quality_operator()) and operation_id is not null
 and exists(select 1 from public.cobra_krediya_cut_operations c where c.operation_id=credit_collection_events.operation_id));

create function public.cobra_krediya_guard_event_history()
returns trigger language plpgsql security invoker set search_path='' as $$begin
 if old.operation_id is not null or old.client_request_id is not null then raise exception 'cobra_event_history_immutable' using errcode='42501'; end if;
 if tg_op='UPDATE' then
  if new.operation_id is distinct from old.operation_id or new.client_request_id is distinct from old.client_request_id then raise exception 'cobra_event_history_immutable' using errcode='42501'; end if;
  return new;
 end if;
 return old;
end$$;
revoke all on function public.cobra_krediya_guard_event_history() from public,anon,authenticated,service_role;
create trigger cobra_krediya_guard_event_history before update or delete on public.credit_collection_events for each row execute function public.cobra_krediya_guard_event_history();
-- Unconditional: TRUNCATE bypasses row RLS, so an RLS-filtered emptiness query is insufficient.
create trigger cobra_events_no_truncate before truncate on public.credit_collection_events for each statement execute function public.cobra_krediya_immutable();

create function public.cobra_krediya_save_collection(p_request_id uuid,p_operation_id uuid,p_event_type text,p_channel text,p_note text,p_promise_date date default null,p_promise_amount numeric default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.credit_collection_events%rowtype; obligation uuid; saved uuid;
begin
 if not coalesce(public.cobra_quality_operator(),false) then raise exception 'cobra_event_not_authorized' using errcode='42501'; end if;
 if p_request_id is null or p_operation_id is null then raise exception 'cobra_event_invalid_reference'; end if;
 select * into e from public.credit_collection_events where client_request_id=p_request_id;
 if e.id is null then
  select id into obligation from public.credit_portfolio_obligations where operation_id=p_operation_id;
  insert into public.credit_collection_events(operation_id,client_request_id,obligation_id,actor_type,event_type,channel,note,promise_date,promise_amount,created_by)
  values(p_operation_id,p_request_id,obligation,'humano',p_event_type,p_channel,btrim(p_note),p_promise_date,p_promise_amount,auth.uid())
  on conflict(client_request_id) do nothing returning id into saved;
  select * into e from public.credit_collection_events where id=saved or client_request_id=p_request_id;
 end if;
 if e.id is null or e.created_by is distinct from auth.uid() or e.operation_id is distinct from p_operation_id or e.event_type is distinct from p_event_type or e.channel is distinct from p_channel or e.note is distinct from btrim(p_note) or e.promise_date is distinct from p_promise_date or e.promise_amount is distinct from p_promise_amount then raise exception 'cobra_event_idempotency_conflict'; end if;
 return jsonb_build_object('id',e.id,'request_id',e.client_request_id,'operation_id',e.operation_id,'obligation_id',e.obligation_id,'event_type',e.event_type,'created_at',e.created_at,'duplicate',saved is null,'status','collection_saved','payment_created',false);
end;
$$;
revoke all on function public.cobra_krediya_save_collection(uuid,uuid,text,text,text,date,numeric) from public,anon,authenticated,service_role;
grant execute on function public.cobra_krediya_save_collection(uuid,uuid,text,text,text,date,numeric) to authenticated;
comment on column public.credit_collection_events.operation_id is 'Collection anchor for an existing credit liquidation. Does not create or infer an outstanding balance. Existing obligation_id linkage is retained when accessible.';
commit;

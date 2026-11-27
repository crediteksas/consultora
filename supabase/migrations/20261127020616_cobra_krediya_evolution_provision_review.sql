-- REVIEW ONLY. Requires separate user approval; no payment or credit-decision execution.
begin;
create table public.cobra_provision_authority(singleton boolean primary key default true check(singleton),user_id uuid not null references public.perfiles(id));
alter table public.cobra_provision_authority enable row level security;
alter table public.cobra_provision_authority force row level security;
revoke all on public.cobra_provision_authority from public,anon,authenticated,service_role;
grant select on public.cobra_provision_authority to authenticated;
create policy cobra_provision_authority_read on public.cobra_provision_authority for select to authenticated using(user_id=(select auth.uid()));
-- Intentionally empty. Bind only the independently verified single profile at activation.
-- The business owner explicitly permits this person to prepare and authorize; no second approver is implied.
create function public.cobra_provision_authorizer() returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce(public.cobra_quality_importer(),false) and exists(select 1 from public.cobra_provision_authority where user_id=(select auth.uid()));
$$;
revoke all on function public.cobra_provision_authorizer() from public,anon,authenticated,service_role;
grant execute on function public.cobra_provision_authorizer() to authenticated;

create table public.cobra_provision_fundings(
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique,payload jsonb not null,
 source_month date not null check(extract(day from source_month)=1),source_digest text not null,
 source_operations uuid[] not null,negative_count integer not null,negative_cents bigint not null,generated_cents bigint not null,prior_used_cents bigint not null check(prior_used_cents>=0),
 available_cents bigint not null,evidence text not null check(length(evidence) between 5 and 600),
 evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$'),prior_evidence text,prior_sha256 text,
 check(prior_used_cents=0 or (prior_evidence is not null and prior_sha256 is not null and length(prior_evidence) between 5 and 600 and prior_sha256 ~ '^[0-9a-f]{64}$')),
 created_by uuid not null references public.perfiles(id),created_at timestamptz not null default clock_timestamp(),
 check(available_cents<=generated_cents-prior_used_cents),
 check(abs(generated_cents::numeric)<=9007199254740991 and abs(available_cents::numeric)<=9007199254740991 and prior_used_cents<=9007199254740991)
);
create index cobra_provision_funding_sources_idx on public.cobra_provision_fundings using gin(source_operations);
create table public.cobra_provision_actions(
 id uuid primary key default gen_random_uuid(),event_no bigint generated always as identity unique,request_id uuid not null unique,payload jsonb not null,
 kind text not null check(kind in('request','authorize','reject','release','execute')),
 parent_id uuid references public.cobra_provision_actions(id),cut_id uuid not null references public.cobra_krediya_cuts(id),operation_id uuid not null references public.liquidation_operations(id),
 cohort_month date not null,amount_cents bigint not null check(amount_cents between 0 and 9007199254740991),allocations jsonb not null default '[]',
 purpose text not null check(purpose in('installments','cancellation')),note text not null check(length(note) between 5 and 600),evidence text,evidence_sha256 text,
 created_by uuid not null references public.perfiles(id),created_at timestamptz not null default clock_timestamp()
);
create unique index cobra_provision_execute_evidence_idx on public.cobra_provision_actions(evidence_sha256) where kind='execute';
create unique index cobra_provision_execute_reference_idx on public.cobra_provision_actions(lower(btrim(evidence))) where kind='execute';
create index cobra_provision_action_parent_idx on public.cobra_provision_actions(parent_id,event_no);
create index cobra_provision_action_operation_idx on public.cobra_provision_actions(operation_id,event_no);
alter table public.cobra_provision_fundings enable row level security;
alter table public.cobra_provision_fundings force row level security;
alter table public.cobra_provision_actions enable row level security;
alter table public.cobra_provision_actions force row level security;
revoke all on public.cobra_provision_fundings,public.cobra_provision_actions from public,anon,authenticated,service_role;
grant select on public.cobra_provision_fundings,public.cobra_provision_actions to authenticated;
grant insert(request_id,payload) on public.cobra_provision_fundings,public.cobra_provision_actions to authenticated;
create policy cobra_provision_fund_read on public.cobra_provision_fundings for select to authenticated using((select public.cobra_quality_operator()));
create policy cobra_provision_fund_insert on public.cobra_provision_fundings for insert to authenticated with check((select public.cobra_provision_authorizer()) and created_by=(select auth.uid()));
create policy cobra_provision_action_read on public.cobra_provision_actions for select to authenticated using((select public.cobra_quality_operator()));
create policy cobra_provision_action_insert on public.cobra_provision_actions for insert to authenticated with check((select public.cobra_quality_operator()) and created_by=(select auth.uid()));

create table public.cobra_provision_funding_operations(operation_id uuid primary key references public.liquidation_operations(id),funding_id uuid not null references public.cobra_provision_fundings(id));
alter table public.cobra_provision_funding_operations enable row level security;
alter table public.cobra_provision_funding_operations force row level security;
revoke all on public.cobra_provision_funding_operations from public,anon,authenticated,service_role;
grant select,insert on public.cobra_provision_funding_operations to authenticated;
create policy cobra_provision_link_read on public.cobra_provision_funding_operations for select to authenticated using((select public.cobra_quality_operator()));
create policy cobra_provision_link_insert on public.cobra_provision_funding_operations for insert to authenticated with check((select public.cobra_provision_authorizer()) and exists(select 1 from public.cobra_provision_fundings f where f.id=funding_id and f.source_operations @> array[operation_id]));

-- Per-operation source amounts are visible only to the single authorizer.
create table public.cobra_provision_funding_sources(funding_id uuid primary key references public.cobra_provision_fundings(id),source_snapshot jsonb not null);
alter table public.cobra_provision_funding_sources enable row level security;
alter table public.cobra_provision_funding_sources force row level security;
revoke all on public.cobra_provision_funding_sources from public,anon,authenticated,service_role;
grant select,insert on public.cobra_provision_funding_sources to authenticated;
create policy cobra_provision_source_read on public.cobra_provision_funding_sources for select to authenticated using((select public.cobra_provision_authorizer()));
create policy cobra_provision_source_insert on public.cobra_provision_funding_sources for insert to authenticated with check((select public.cobra_provision_authorizer()) and exists(select 1 from public.cobra_provision_fundings f where f.id=funding_id and f.source_digest=encode(sha256(convert_to(source_snapshot::text,'UTF8')),'hex')));

-- Fail closed on malformed eligible sources. Offset-free timestamps explicitly use Bogota.
create function public.cobra_provision_source_rows() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not coalesce(public.cobra_provision_authorizer(),false) then raise exception 'cobra_fund_authority_required' using errcode='42501';end if;
 with raw as(select x.id,x.normalized_data->>'fecha' fecha,x.operation_at,x.policy_snapshot#>>'{krediya_v2,provision}' amount from public.liquidation_operations x join public.liquidations l on l.id=x.liquidation_id
 where x.plataforma='krediya' and x.reconocida and l.approved_at is not null and l.approved_by is not null and l.frozen_at is not null),
 parsed as(select id,case when amount ~ '^-?[0-9]+(\.[0-9]{1,2})?$' then case when abs(amount::numeric*100)<=9007199254740991 then (amount::numeric*100)::bigint else null end else null end cents,
 case when fecha is null then (operation_at at time zone 'America/Bogota')::date
 when fecha ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then fecha::date
 when fecha ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?([Zz]|[+-][0-9]{2}:[0-9]{2})$' then (fecha::timestamptz at time zone 'America/Bogota')::date
 when fecha ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?$' then fecha::timestamp::date
 else null end business_date from raw)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'month',date_trunc('month',business_date)::date,'cents',cents) order by id),'[]') into result from parsed;
 if jsonb_array_length(result)>100000 then raise exception 'cobra_fund_source_too_large';end if;
 if exists(select 1 from jsonb_array_elements(result) r where r->>'month' is null or r->>'cents' is null) then raise exception 'cobra_fund_source_incomplete';end if;
 return result;
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then raise exception 'cobra_fund_source_incomplete';
end $$;
create function public.cobra_provision_source(p_month date) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare rows_json jsonb;n bigint;gross numeric;negatives bigint;negative_total numeric;
begin
 if p_month is null or extract(day from p_month)<>1 then raise exception 'cobra_fund_invalid_month';end if;
 select coalesce(jsonb_agg(r order by r->>'id'),'[]'),count(*) into rows_json,n from jsonb_array_elements(public.cobra_provision_source_rows()) r
 where (r->>'month')::date=p_month and not exists(select 1 from public.cobra_provision_funding_operations f where f.operation_id=(r->>'id')::uuid);
 if n=0 then return jsonb_build_object('count',0,'generated_cents',0,'negative_count',0,'negative_cents',0,'digest',null,'operations','[]'::jsonb,'snapshot','[]'::jsonb);end if;
 if n>10000 then raise exception 'cobra_fund_source_incomplete';end if;
 select sum((r->>'cents')::numeric),count(*) filter(where (r->>'cents')::bigint<0),coalesce(sum((r->>'cents')::numeric) filter(where (r->>'cents')::bigint<0),0) into gross,negatives,negative_total from jsonb_array_elements(rows_json) r;
 if abs(gross)>9007199254740991 or abs(negative_total)>9007199254740991 then raise exception 'cobra_fund_amount_range';end if;
 return jsonb_build_object('count',n,'generated_cents',gross::bigint,'negative_count',negatives,'negative_cents',negative_total::bigint,'digest',encode(sha256(convert_to(rows_json::text,'UTF8')),'hex'),'operations',(select jsonb_agg(r->>'id') from jsonb_array_elements(rows_json) r),'snapshot',rows_json);
end $$;
create function public.cobra_provision_source_guard() returns void language plpgsql stable security invoker set search_path='' as $$
declare live jsonb:=public.cobra_provision_source_rows();
begin
 if exists(select 1 from public.cobra_provision_fundings f where not exists(select 1 from public.cobra_provision_funding_sources s where s.funding_id=f.id)) or exists((select r from public.cobra_provision_funding_sources f cross join lateral jsonb_array_elements(f.source_snapshot) r) except (select r from jsonb_array_elements(live) r)) then raise exception 'cobra_fund_funded_source_changed';end if;
 if exists(select 1 from jsonb_array_elements(live) r where (r->>'cents')::bigint<0 and not exists(select 1 from public.cobra_provision_funding_operations f where f.operation_id=(r->>'id')::uuid)) then raise exception 'cobra_fund_unreconciled_negative';end if;
end $$;

create function public.cobra_provision_balances() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not coalesce(public.cobra_quality_operator(),false) then raise exception 'cobra_fund_not_authorized' using errcode='42501';end if;
 with authorizations as (
 select a.*,coalesce(t.kind,'authorize') current_kind,coalesce(t.amount_cents,0) executed
 from public.cobra_provision_actions a left join lateral(select x.kind,x.amount_cents from public.cobra_provision_actions x where x.parent_id=a.parent_id and x.kind in('release','execute') order by x.event_no desc limit 1) t on true where a.kind='authorize'
 ), allocations as (
 select a.parent_id,a.current_kind,a.executed,(x->>'fund_id')::uuid fund_id,(x->>'cents')::bigint cents,
 coalesce(sum((x->>'cents')::bigint) over(partition by a.id order by ord rows between unbounded preceding and 1 preceding),0) prior
 from authorizations a cross join lateral jsonb_array_elements(a.allocations) with ordinality q(x,ord)
 ), used as (
 select fund_id,coalesce(sum(cents) filter(where current_kind='authorize'),0) reserved,
 coalesce(sum(least(cents,greatest(0,executed-prior))) filter(where current_kind='execute'),0) spent from allocations group by fund_id
 ) select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'source_month',f.source_month,'generated_cents',f.generated_cents,'prior_used_cents',f.prior_used_cents,'available_cents',f.available_cents,'reserved_cents',coalesce(u.reserved,0),'spent_cents',coalesce(u.spent,0),'remaining_cents',f.available_cents-coalesce(u.reserved,0)-coalesce(u.spent,0),'evidence',f.evidence) order by f.source_month,f.id),'[]') into result from public.cobra_provision_fundings f left join used u on u.fund_id=f.id;
 return result;
end $$;

create function public.cobra_provision_prepare_funding() returns trigger language plpgsql security invoker set search_path='' as $$
declare s jsonb;
begin
 if not coalesce(public.cobra_provision_authorizer(),false) then raise exception 'cobra_fund_authority_required' using errcode='42501';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'cobra_fund_isolation_required';end if;
 perform pg_advisory_xact_lock(726026,22);
 if new.request_id is null or jsonb_typeof(new.payload) is distinct from 'object' or (select count(*) from jsonb_object_keys(new.payload))<>8 or not new.payload ?& array['source_month','source_digest','prior_used_cents','available_cents','evidence','evidence_sha256','prior_evidence','prior_sha256'] then raise exception 'cobra_fund_invalid_payload';end if;
 if new.payload->>'source_month' !~ '^[0-9]{4}-[0-9]{2}-01$' then raise exception 'cobra_fund_invalid_month';end if;
 new.source_month=(new.payload->>'source_month')::date;s=public.cobra_provision_source(new.source_month);
 if (s->>'count')::int=0 or new.payload->>'source_digest' is distinct from s->>'digest' then raise exception 'cobra_fund_source_changed';end if;
 if jsonb_typeof(new.payload->'prior_used_cents') is distinct from 'number' or new.payload->>'prior_used_cents' !~ '^[0-9]{1,16}$' or jsonb_typeof(new.payload->'available_cents') is distinct from 'number' or new.payload->>'available_cents' !~ '^-?[0-9]{1,16}$' or jsonb_typeof(new.payload->'evidence') is distinct from 'string' then raise exception 'cobra_fund_invalid_amount';end if;
 new.generated_cents=(s->>'generated_cents')::bigint;new.prior_used_cents=(new.payload->>'prior_used_cents')::bigint;new.available_cents=(new.payload->>'available_cents')::bigint;
 -- Signed negative provisions remain in the fund. They never become available cash.
 new.negative_count=(s->>'negative_count')::integer;new.negative_cents=(s->>'negative_cents')::bigint;
 new.evidence_sha256=new.payload->>'evidence_sha256';new.prior_evidence=new.payload->>'prior_evidence';new.prior_sha256=new.payload->>'prior_sha256';
 new.source_digest=s->>'digest';new.source_operations=array(select value::uuid from jsonb_array_elements_text(s->'operations'));new.evidence=btrim(new.payload->>'evidence');
 new.created_by=auth.uid();new.created_at=clock_timestamp();return new;
end $$;
create trigger cobra_provision_funding_prepare before insert on public.cobra_provision_fundings for each row execute function public.cobra_provision_prepare_funding();

create function public.cobra_provision_prepare_action() returns trigger language plpgsql security invoker set search_path='' as $$
declare r public.cobra_provision_actions%rowtype; state text; allocation jsonb; funds jsonb; total numeric:=0; remaining numeric; seen uuid[]:='{}';fid uuid;
begin
 if not coalesce(public.cobra_quality_operator(),false) then raise exception 'cobra_fund_not_authorized' using errcode='42501';end if;
 if new.payload->>'kind' is distinct from 'request' and not coalesce(public.cobra_provision_authorizer(),false) then raise exception 'cobra_fund_authority_required' using errcode='42501';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'cobra_fund_isolation_required';end if;
 perform pg_advisory_xact_lock(726026,22);
 -- Identity is allocated before BEFORE triggers; stale direct inserts must retry.
 if exists(select 1 from public.cobra_provision_actions where event_no>new.event_no) then raise exception 'cobra_fund_sequence_retry';end if;
 if new.request_id is null or jsonb_typeof(new.payload) is distinct from 'object' or (select count(*) from jsonb_object_keys(new.payload))<>10 or not new.payload ?& array['kind','parent_id','cut_id','operation_id','amount_cents','allocations','purpose','note','evidence','evidence_sha256'] then raise exception 'cobra_fund_invalid_payload';end if;
 new.evidence_sha256=new.payload->>'evidence_sha256';
 if (new.payload->>'kind'='execute' and (new.evidence_sha256 is null or new.evidence_sha256 !~ '^[0-9a-f]{64}$')) or (new.payload->>'kind'<>'execute' and new.evidence_sha256 is not null) then raise exception 'cobra_fund_evidence_hash_required';end if;
 new.kind=new.payload->>'kind';new.note=btrim(new.payload->>'note');new.evidence=nullif(btrim(new.payload->>'evidence'),'');
 if jsonb_typeof(new.payload->'amount_cents') is distinct from 'number' or new.payload->>'amount_cents' !~ '^[0-9]{1,16}$' or jsonb_typeof(new.payload->'note') is distinct from 'string' or jsonb_typeof(new.payload->'allocations') is distinct from 'array' then raise exception 'cobra_fund_invalid_payload';end if;
 new.amount_cents=(new.payload->>'amount_cents')::bigint;new.allocations=new.payload->'allocations';
 if new.kind='request' then
  if new.payload->>'parent_id' is not null or new.allocations<>'[]'::jsonb or new.evidence is not null or new.amount_cents<=0 then raise exception 'cobra_fund_invalid_request';end if;
  new.parent_id=null;new.cut_id=(new.payload->>'cut_id')::uuid;new.operation_id=(new.payload->>'operation_id')::uuid;new.purpose=new.payload->>'purpose';
  select cohort_month into new.cohort_month from public.cobra_krediya_cuts c where c.id=new.cut_id and c.link_keys ? new.operation_id::text;
  if not found then raise exception 'cobra_fund_credit_not_in_cut';end if;
 else
  if not coalesce(public.cobra_provision_authorizer(),false) then raise exception 'cobra_fund_authority_required' using errcode='42501';end if;
  new.parent_id=(new.payload->>'parent_id')::uuid;select * into r from public.cobra_provision_actions where id=new.parent_id and kind='request';
  if not found then raise exception 'cobra_fund_request_not_found';end if;
  if new.payload->>'cut_id' is not null or new.payload->>'operation_id' is not null or new.payload->>'purpose' is not null then raise exception 'cobra_fund_canonical_reference_required';end if;
  new.cut_id=r.cut_id;new.operation_id=r.operation_id;new.cohort_month=r.cohort_month;new.purpose=r.purpose;
  select kind into state from public.cobra_provision_actions where parent_id=r.id order by event_no desc limit 1;state=coalesce(state,'request');
  if new.kind='authorize' then
   if state<>'request' or new.amount_cents<>r.amount_cents or jsonb_array_length(new.allocations) not between 1 and 100 or new.evidence is not null then raise exception 'cobra_fund_invalid_transition';end if;
   perform public.cobra_provision_source_guard();
   funds=public.cobra_provision_balances();select coalesce(sum((x->>'remaining_cents')::numeric),0) into remaining from jsonb_array_elements(funds) x;
   if remaining<new.amount_cents then raise exception 'cobra_fund_insufficient_total';end if;
   for allocation in select value from jsonb_array_elements(new.allocations) loop
    if jsonb_typeof(allocation) is distinct from 'object' or (select count(*) from jsonb_object_keys(allocation))<>2 or not allocation ?& array['fund_id','cents'] or jsonb_typeof(allocation->'cents') is distinct from 'number' or allocation->>'cents' !~ '^[0-9]{1,16}$' or (allocation->>'cents')::numeric<=0 then raise exception 'cobra_fund_invalid_allocation';end if;
    fid=(allocation->>'fund_id')::uuid;if fid=any(seen) then raise exception 'cobra_fund_duplicate_allocation';end if;seen=array_append(seen,fid);
    select (x->>'remaining_cents')::numeric into remaining from jsonb_array_elements(funds) x where x->>'id'=fid::text;
    if remaining is null or remaining<(allocation->>'cents')::numeric then raise exception 'cobra_fund_insufficient_allocation';end if;total=total+(allocation->>'cents')::numeric;
   end loop;
   if total<>new.amount_cents then raise exception 'cobra_fund_allocation_total';end if;
  elsif new.kind='reject' then
   if state<>'request' or new.amount_cents<>0 or new.allocations<>'[]'::jsonb or new.evidence is not null then raise exception 'cobra_fund_invalid_transition';end if;
  elsif new.kind in('execute','release') then
   if state<>'authorize' or new.allocations<>'[]'::jsonb then raise exception 'cobra_fund_invalid_transition';end if;
   if new.kind='execute' then perform public.cobra_provision_source_guard();select coalesce(sum((x->>'remaining_cents')::numeric),0) into remaining from jsonb_array_elements(public.cobra_provision_balances()) x;if remaining<0 then raise exception 'cobra_fund_deficit_review_required';end if;end if;
   if new.kind='execute' and (new.amount_cents<=0 or new.amount_cents>r.amount_cents or new.evidence is null or length(new.evidence) not between 5 and 600) then raise exception 'cobra_fund_execution_evidence_required';end if;
   if new.kind='release' and (new.amount_cents<>0 or new.evidence is not null) then raise exception 'cobra_fund_invalid_transition';end if;
  else raise exception 'cobra_fund_invalid_action';end if;
 end if;
 new.created_by=auth.uid();new.created_at=clock_timestamp();return new;
end $$;
create trigger cobra_provision_action_prepare before insert on public.cobra_provision_actions for each row execute function public.cobra_provision_prepare_action();
create function public.cobra_provision_link_funding() returns trigger language plpgsql security invoker set search_path='' as $$
declare s jsonb;begin s=public.cobra_provision_source(new.source_month);if s->>'digest' is distinct from new.source_digest then raise exception 'cobra_fund_source_changed';end if;insert into public.cobra_provision_funding_sources values(new.id,s->'snapshot');insert into public.cobra_provision_funding_operations(operation_id,funding_id) select unnest(new.source_operations),new.id;return new;end$$;
create trigger cobra_provision_funding_link after insert on public.cobra_provision_fundings for each row execute function public.cobra_provision_link_funding();
create function public.cobra_provision_immutable() returns trigger language plpgsql security invoker set search_path='' as $$begin raise exception 'cobra_fund_history_immutable';end$$;
create trigger cobra_provision_funding_immutable before update or delete on public.cobra_provision_fundings for each row execute function public.cobra_provision_immutable();
create trigger cobra_provision_action_immutable before update or delete on public.cobra_provision_actions for each row execute function public.cobra_provision_immutable();

create trigger cobra_provision_sources_immutable before update or delete on public.cobra_provision_funding_sources for each row execute function public.cobra_provision_immutable();
create trigger cobra_provision_sources_no_truncate before truncate on public.cobra_provision_funding_sources for each statement execute function public.cobra_provision_immutable();
create trigger cobra_provision_links_immutable before update or delete on public.cobra_provision_funding_operations for each row execute function public.cobra_provision_immutable();
create trigger cobra_provision_fundings_no_truncate before truncate on public.cobra_provision_fundings for each statement execute function public.cobra_provision_immutable();
create trigger cobra_provision_actions_no_truncate before truncate on public.cobra_provision_actions for each statement execute function public.cobra_provision_immutable();
create trigger cobra_provision_links_no_truncate before truncate on public.cobra_provision_funding_operations for each statement execute function public.cobra_provision_immutable();
create trigger cobra_provision_authority_no_change before update or delete on public.cobra_provision_authority for each row execute function public.cobra_provision_immutable();
create trigger cobra_provision_authority_no_truncate before truncate on public.cobra_provision_authority for each statement execute function public.cobra_provision_immutable();

-- Single MVCC snapshot for both ledgers; callers must not mix separate reads.
create function public.cobra_provision_book() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare f jsonb;a jsonb;
begin
 if not coalesce(public.cobra_quality_operator(),false) then raise exception 'cobra_fund_not_authorized' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.source_month,x.id),'[]') into f from public.cobra_provision_fundings x;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.event_no),'[]') into a from public.cobra_provision_actions x;
 if jsonb_array_length(f)>10000 or jsonb_array_length(a)>10000 then raise exception 'cobra_fund_book_too_large';end if;
 return jsonb_build_object('fundings',f,'actions',a);
end$$;

create function public.cobra_provision_save(p_request_id uuid,p_kind text,p_payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if not coalesce(public.cobra_quality_operator(),false) or (p_kind='funding' and not coalesce(public.cobra_provision_authorizer(),false)) then raise exception 'cobra_fund_not_authorized' using errcode='42501';end if;
 if p_request_id is null or p_kind is null or p_kind not in('funding','action') then raise exception 'cobra_fund_invalid_request';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'cobra_fund_isolation_required';end if;
 if p_kind='action' and p_payload->>'kind' is distinct from 'request' and not coalesce(public.cobra_provision_authorizer(),false) then raise exception 'cobra_fund_authority_required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(726026,22);
 if p_kind='funding' then
  select to_jsonb(f) into result from public.cobra_provision_fundings f where request_id=p_request_id;
  if result is null then insert into public.cobra_provision_fundings(request_id,payload) values(p_request_id,p_payload) returning to_jsonb(cobra_provision_fundings) into result;end if;
 else
  select to_jsonb(a) into result from public.cobra_provision_actions a where request_id=p_request_id;
  if result is null then insert into public.cobra_provision_actions(request_id,payload) values(p_request_id,p_payload) returning to_jsonb(cobra_provision_actions) into result;end if;
 end if;
 if result->'payload' is distinct from p_payload or result->>'created_by' is distinct from auth.uid()::text then raise exception 'cobra_fund_idempotency_conflict';end if;
 return jsonb_build_object('id',result->'id','request_id',p_request_id,'payload',result->'payload','saved',true,'payment_executed',false);
end $$;

-- Human-readable, fact-only history. Does not change NOVA authorizations or call a model.
create function public.cobra_krediya_history_cuts(p_operation_id uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare doc text; docs int; result jsonb;
begin
 if not coalesce(public.cobra_quality_operator(),false) then raise exception 'cobra_history_not_authorized' using errcode='42501';end if;
 select min(r->>'document'),count(distinct r->>'document') into doc,docs from public.cobra_krediya_cut_operations l join public.cobra_krediya_cuts c on c.id=l.cut_id cross join lateral jsonb_array_elements(c.observations) r where l.operation_id=p_operation_id and r->>'operation_id'=p_operation_id::text;
 if docs=0 then raise exception 'cobra_history_not_found';end if;
 if docs<>1 then raise exception 'cobra_history_identity_review';end if;
 -- Include every saved cut of each observed cohort, even when this customer is absent.
 with months as(select distinct c.cohort_month from public.cobra_krediya_cuts c where exists(select 1 from jsonb_array_elements(c.observations) r where r->>'document'=doc))
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'cohort_month',c.cohort_month,'cutoff',c.cutoff,'received_at',c.received_at,'source_name',c.source_name,'file_sha256',c.file_sha256,'observations',(select coalesce(jsonb_agg(r),'[]') from jsonb_array_elements(c.observations) r where r->>'document'=doc),'population_count',c.row_count) order by c.cutoff,c.received_at,c.id),'[]') into result from public.cobra_krediya_cuts c join months m using(cohort_month);
 if jsonb_array_length(result)>1000 then raise exception 'cobra_history_requires_narrower_scope';end if;
 return jsonb_build_object('schema_version',1,'operation_id',p_operation_id,'cuts',result,'automatic_decision',false,'official_quality',false);
end $$;
revoke all on function public.cobra_provision_source(date),public.cobra_provision_balances(),public.cobra_provision_save(uuid,text,jsonb),public.cobra_krediya_history_cuts(uuid),public.cobra_provision_prepare_funding(),public.cobra_provision_prepare_action(),public.cobra_provision_immutable() from public,anon,authenticated,service_role;
revoke all on function public.cobra_provision_source_rows(),public.cobra_provision_source_guard(),public.cobra_provision_book(),public.cobra_provision_link_funding() from public,anon,authenticated,service_role;
grant execute on function public.cobra_provision_source_rows(),public.cobra_provision_source_guard(),public.cobra_provision_book() to authenticated;
grant execute on function public.cobra_provision_source(date),public.cobra_provision_balances(),public.cobra_provision_save(uuid,text,jsonb),public.cobra_krediya_history_cuts(uuid) to authenticated;
comment on table public.cobra_provision_actions is 'Audited authorization and evidence of provision usage. Never executes a payment or changes a customer credit balance.';
commit;

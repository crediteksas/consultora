-- Exact same invoker functions, owners, ACLs and checks; only caller-UUID lookup changes.
do $identity_preflight$ begin
 if not coalesce((select reloptions @> array['security_invoker=true'] from pg_catalog.pg_class where oid='public.creditos_cartera_operaciones'::regclass),false) then raise exception 'cartera_view_must_be_invoker';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_krediya_save_collection(uuid,uuid,text,text,text,date,numeric)'::regprocedure))<>'9ded2229e4c0f09292278010efef595f' then raise exception 'cartera_identity_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_krediya_validate_event()'::regprocedure))<>'619802e296d0e4e8fb8c003c5cd0e2b7' then raise exception 'cartera_identity_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_quality_operator()'::regprocedure))<>'fdfa3953e70bb6a20113d88172395ba8' then raise exception 'cartera_identity_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.tiene_capacidad_cartera(text)'::regprocedure))<>'b39ff51350c58028c5309d041f879028' then raise exception 'cartera_identity_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_provision_authorizer()'::regprocedure))<>'7469482b7393336dfb24bec48b1434f7' then raise exception 'cartera_fund_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_provision_prepare_action()'::regprocedure))<>'e8f55710558aa63c77e0dcd70cfd049c' then raise exception 'cartera_fund_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_quality_importer()'::regprocedure))<>'ae58e5f4a241ae148b89f86d48a7ec51' then raise exception 'cartera_trusted_dependency_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.creditos_cartera_puede_leer(text)'::regprocedure))<>'62c421a981947be30b9d7e9fc3c060f4' then raise exception 'cartera_trusted_dependency_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.rol_actual()'::regprocedure))<>'30233b4b90bed68ae5fce3f590e65b27' then raise exception 'cartera_trusted_dependency_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.tiene_capacidad_aliados(text)'::regprocedure))<>'0baaeaffa5f5f7c697d8eb1b2af0f2ae' then raise exception 'cartera_trusted_dependency_changed';end if;
 if md5(pg_catalog.pg_get_viewdef('public.creditos_cartera_operaciones'::regclass,true))<>'5795039e56374ed229d7b8acd9c21616' then raise exception 'cartera_trusted_view_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_krediya_history_cuts(uuid)'::regprocedure))<>'2c83998920c39b878c0ab32634cabbc8' then raise exception 'cartera_draft_dependency_changed';end if;
end $identity_preflight$;
CREATE OR REPLACE FUNCTION public.cobra_krediya_save_collection(p_request_id uuid, p_operation_id uuid, p_event_type text, p_channel text, p_note text, p_promise_date date DEFAULT NULL::date, p_promise_amount numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare e public.credit_collection_events%rowtype; obligation uuid; saved uuid;
begin
 if not coalesce(public.cobra_quality_operator(),false) then raise exception 'cobra_event_not_authorized' using errcode='42501'; end if;
 if p_request_id is null or p_operation_id is null then raise exception 'cobra_event_invalid_reference'; end if;
 select * into e from public.credit_collection_events where client_request_id=p_request_id;
 if e.id is null then
  select id into obligation from public.credit_portfolio_obligations where operation_id=p_operation_id;
  insert into public.credit_collection_events(operation_id,client_request_id,obligation_id,actor_type,event_type,channel,note,promise_date,promise_amount,created_by)
  values(p_operation_id,p_request_id,obligation,'humano',p_event_type,p_channel,btrim(p_note),p_promise_date,p_promise_amount,public.cartera_subject())
  on conflict(client_request_id) do nothing returning id into saved;
  select * into e from public.credit_collection_events where id=saved or client_request_id=p_request_id;
 end if;
 if e.id is null or e.created_by is distinct from public.cartera_subject() or e.operation_id is distinct from p_operation_id or e.event_type is distinct from p_event_type or e.channel is distinct from p_channel or e.note is distinct from btrim(p_note) or e.promise_date is distinct from p_promise_date or e.promise_amount is distinct from p_promise_amount then raise exception 'cobra_event_idempotency_conflict'; end if;
 return jsonb_build_object('id',e.id,'request_id',e.client_request_id,'operation_id',e.operation_id,'obligation_id',e.obligation_id,'event_type',e.event_type,'created_at',e.created_at,'duplicate',saved is null,'status','collection_saved','payment_created',false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.cobra_krediya_validate_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 -- Legacy RPC remains unchanged. New operation-based events have their own explicit checks.
 if new.operation_id is null then
  if current_user in ('anon','authenticated') then raise exception 'cobra_direct_legacy_event_denied' using errcode='42501'; end if;
  if new.client_request_id is not null then raise exception 'cobra_event_invalid_reference'; end if;
  return new;
 end if;
 if not coalesce(public.cobra_quality_operator(),false) or new.created_by is distinct from public.cartera_subject() or new.actor_type is distinct from 'humano' then raise exception 'cobra_event_not_authorized' using errcode='42501'; end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.cobra_quality_operator()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select (select public.cartera_subject()) is not null and public.rol_actual() is not null
 and (public.rol_actual() in ('gerencia','auditoria') or public.tiene_capacidad_cartera('manage'));
$function$;

CREATE OR REPLACE FUNCTION public.tiene_capacidad_cartera(p_capacidad text DEFAULT 'read'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select (select public.cartera_subject()) is not null and exists (
    select 1
    from public.credit_portfolio_operators operator
    where operator.perfil_id = (select public.cartera_subject())
      and operator.active
      and case p_capacidad
        when 'read' then operator.capability in ('read','manage')
        when 'manage' then operator.capability = 'manage'
        else false
      end
  );
$function$;

create or replace function public.cobra_provision_authorizer() returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce(public.cobra_quality_importer(),false) and exists(select 1 from public.cobra_provision_authority where user_id=(select public.cartera_subject()));
$$;
create or replace function public.cobra_provision_prepare_action() returns trigger language plpgsql security invoker set search_path='' as $$
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
 new.created_by=public.cartera_subject();new.created_at=clock_timestamp();return new;
end $$;
create or replace function kora_private.cartera_assert_dependencies() returns void language plpgsql security invoker set search_path='' as $$begin
 if not coalesce((select reloptions @> array['security_invoker=true'] from pg_catalog.pg_class where oid='public.creditos_cartera_operaciones'::regclass),false) then raise exception 'cartera_view_must_be_invoker';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_krediya_save_collection(uuid,uuid,text,text,text,date,numeric)'::regprocedure))<>'3dc437336cc8eb92559070fb1e7cdbf5' then raise exception 'cartera_identity_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_krediya_validate_event()'::regprocedure))<>'ca306bf55021c5d3c9fd80580a6b4b90' then raise exception 'cartera_identity_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_quality_operator()'::regprocedure))<>'367477a866771c9bf1cb8bed602fbbbb' then raise exception 'cartera_identity_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.tiene_capacidad_cartera(text)'::regprocedure))<>'f672b9c2a0726f23bc3e925636a2add7' then raise exception 'cartera_identity_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_provision_authorizer()'::regprocedure))<>'335d23bc6e54b083dbbedd8f14523ce6' then raise exception 'cartera_fund_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_provision_prepare_action()'::regprocedure))<>'e2c76e47ef6dc2ef839c67b95ebdd9ff' then raise exception 'cartera_fund_callsite_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_quality_importer()'::regprocedure))<>'ae58e5f4a241ae148b89f86d48a7ec51' then raise exception 'cartera_trusted_dependency_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.creditos_cartera_puede_leer(text)'::regprocedure))<>'62c421a981947be30b9d7e9fc3c060f4' then raise exception 'cartera_trusted_dependency_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.rol_actual()'::regprocedure))<>'30233b4b90bed68ae5fce3f590e65b27' then raise exception 'cartera_trusted_dependency_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.tiene_capacidad_aliados(text)'::regprocedure))<>'0baaeaffa5f5f7c697d8eb1b2af0f2ae' then raise exception 'cartera_trusted_dependency_changed';end if;
 if md5(pg_catalog.pg_get_viewdef('public.creditos_cartera_operaciones'::regclass,true))<>'5795039e56374ed229d7b8acd9c21616' then raise exception 'cartera_trusted_view_changed';end if;
 if md5(pg_catalog.pg_get_functiondef('public.cobra_krediya_history_cuts(uuid)'::regprocedure))<>'2c83998920c39b878c0ab32634cabbc8' then raise exception 'cartera_draft_dependency_changed';end if;
end$$;

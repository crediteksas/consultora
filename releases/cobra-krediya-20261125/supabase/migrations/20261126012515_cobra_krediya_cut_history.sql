-- REVIEW CANDIDATE ONLY. No production execution is authorized.
-- Immutable provider observations; never creates a loan, repayment or financial balance.
begin;
-- Source records remain unchanged: cancellation/evidence rows may share a contract.
-- Import capability depends on reviewed full-source visibility; that dependency is verified locally before integration.

create function public.cobra_quality_operator()
returns boolean language sql stable security invoker set search_path = '' as $$
 select (select auth.uid()) is not null and public.rol_actual() is not null
 and (public.rol_actual() in ('gerencia','auditoria') or public.tiene_capacidad_cartera('manage'));
$$;
revoke all on function public.cobra_quality_operator() from public,anon,authenticated,service_role;
grant execute on function public.cobra_quality_operator() to authenticated;

create function public.cobra_quality_importer()
returns boolean language sql stable security invoker set search_path='' as $$
 select public.cobra_quality_operator() and public.tiene_capacidad_aliados('revisor');
$$;
revoke all on function public.cobra_quality_importer() from public,anon,authenticated,service_role;
grant execute on function public.cobra_quality_importer() to authenticated;

create function public.cobra_quality_fold(p_value text)
returns text language sql immutable strict security invoker set search_path = '' as $$
 select lower(regexp_replace(regexp_replace(normalize(btrim(p_value),NFD),U&'[\0300-\036f]','','g'),'[[:space:]]+',' ','g'));
$$;
create function public.cobra_quality_document(p_value text)
returns text language sql immutable strict security invoker set search_path = '' as $$
 select case when btrim(p_value) ~ '^[0-9]{1,3}(\.[0-9]{3})+$' then replace(btrim(p_value),'.','')
 when btrim(p_value) ~ '^[a-zA-Z0-9-]{3,40}$' then lower(btrim(p_value)) else null end;
$$;
revoke all on function public.cobra_quality_fold(text),public.cobra_quality_document(text) from public,anon,authenticated,service_role;
grant execute on function public.cobra_quality_fold(text),public.cobra_quality_document(text) to authenticated;

create table public.cobra_krediya_cuts (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique,
 file_sha256 text not null check(file_sha256 ~ '^[0-9a-f]{64}$'),
 payload_sha256 text not null check(payload_sha256 ~ '^[0-9a-f]{64}$'),
 cohort_month date not null check(extract(day from cohort_month)=1),
 cutoff date not null check(cutoff>=cohort_month),
 source_name text not null check(length(source_name) between 1 and 180),
 source_rows jsonb not null check(jsonb_typeof(source_rows)='array'),
 observations jsonb not null check(jsonb_typeof(observations)='array'),
 link_keys jsonb not null check(jsonb_typeof(link_keys)='object'),
 row_count integer not null check(row_count between 1 and 10000),
 received_by uuid not null references public.perfiles(id) on delete restrict,
 received_at timestamptz not null default now(),
 schema_version integer not null default 1 check(schema_version=1),
 unique(file_sha256,cohort_month,cutoff)
);
create table public.cobra_krediya_cut_operations (
 cut_id uuid not null references public.cobra_krediya_cuts(id) on delete restrict,
 operation_id uuid not null references public.liquidation_operations(id) on delete restrict,
 primary key(cut_id,operation_id)
);
create index cobra_krediya_cuts_period_idx on public.cobra_krediya_cuts(cohort_month,cutoff desc,received_at desc);
create index cobra_krediya_cut_operation_idx on public.cobra_krediya_cut_operations(operation_id,cut_id);
alter table public.cobra_krediya_cuts enable row level security;
alter table public.cobra_krediya_cuts force row level security;
alter table public.cobra_krediya_cut_operations enable row level security;
alter table public.cobra_krediya_cut_operations force row level security;
revoke all on public.cobra_krediya_cuts,public.cobra_krediya_cut_operations from public,anon,authenticated,service_role;
-- Explicitly authorized tracking snapshot access. Raw submitted rows are not readable by operators.
grant select(id,request_id,file_sha256,payload_sha256,cohort_month,cutoff,source_name,observations,link_keys,row_count,received_by,received_at,schema_version) on public.cobra_krediya_cuts to authenticated;
grant select on public.cobra_krediya_cut_operations to authenticated;
grant insert(request_id,file_sha256,cohort_month,cutoff,source_name,source_rows) on public.cobra_krediya_cuts to authenticated;
grant insert(cut_id,operation_id) on public.cobra_krediya_cut_operations to authenticated;
create policy cobra_quality_cuts_read on public.cobra_krediya_cuts for select to authenticated using ((select public.cobra_quality_operator()));
create policy cobra_quality_cuts_insert on public.cobra_krediya_cuts for insert to authenticated with check ((select public.cobra_quality_importer()) and received_by=(select auth.uid()));
create policy cobra_quality_links_read on public.cobra_krediya_cut_operations for select to authenticated using ((select public.cobra_quality_operator()));
create policy cobra_quality_links_insert on public.cobra_krediya_cut_operations for insert to authenticated with check (
 (select public.cobra_quality_operator()) and exists(
 select 1 from public.cobra_krediya_cuts c where c.id=cut_id and c.received_by=(select auth.uid())
 and c.link_keys ? operation_id::text));

create function public.cobra_krediya_prepare_cut()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
 r jsonb; op public.liquidation_operations%rowtype; source_map jsonb; matched jsonb;
 contract text; created date; business_date date; fee bigint; financed bigint; total integer; cycled integer; paid integer; overdue integer;
 canonical_rows jsonb[]='{}'; canonical jsonb='[]'; key text; count_rows integer; due_date date; expected integer;
begin
 if not coalesce(public.cobra_quality_importer(),false) then raise exception 'cobra_not_authorized' using errcode='42501'; end if;
 if new.cutoff>(now() at time zone 'America/Bogota')::date then raise exception 'cobra_future_cutoff'; end if;
 if new.source_rows is null or jsonb_typeof(new.source_rows)<>'array' then raise exception 'cobra_invalid_rows'; end if;
 count_rows=jsonb_array_length(new.source_rows);
 if count_rows<1 or count_rows>10000 or octet_length(new.source_rows::text)>8000000 then raise exception 'cobra_rows_limit'; end if;
 if exists(select 1 from jsonb_array_elements(new.source_rows) x group by lower(btrim(x->>'contract')) having count(*)>1) then raise exception 'cobra_duplicate_or_invalid_contract'; end if;
 -- Read the visible source once. Under RLS the normalized expression is not
 -- necessarily usable as an index condition; one lookup per row scans it N times.
 -- This stays SECURITY INVOKER and retains the same source-visibility dependency.
 with requested as materialized (
  select lower(btrim(x->>'contract')) contract from jsonb_array_elements(new.source_rows) x
 ), sources as materialized (
  select lower(btrim(o.external_id)) contract,to_jsonb(o) operation,
   l.approved_at is not null and l.approved_by is not null and l.frozen_at is not null approved
  from public.liquidation_operations o
  join requested r on r.contract=lower(btrim(o.external_id))
  left join public.liquidations l on l.id=o.liquidation_id
  where o.plataforma='krediya' and o.reconocida
 ), grouped as (
  select s.contract,jsonb_build_object('matches',count(*),'operation',(array_agg(s.operation))[1],'approved',bool_and(s.approved)) value
  from sources s group by s.contract
 ) select coalesce(jsonb_object_agg(g.contract,g.value),'{}'::jsonb) into source_map from grouped g;
 for r in select value from jsonb_array_elements(new.source_rows) loop
  if jsonb_typeof(r)<>'object' or (select count(*) from jsonb_object_keys(r))<>13
  or not r ?& array['contract','document','customer','store','created','financed_cents','fee_cents','total_installments','frequency','cycled','paid','overdue','contract_status'] then raise exception 'cobra_invalid_row_shape'; end if;
  foreach key in array array['contract','document','customer','store','created','contract_status'] loop
   if jsonb_typeof(r->key) is distinct from 'string' then raise exception 'cobra_invalid_text'; end if;
  end loop;
  if r->>'contract_status'<>'signed_approved' then raise exception 'cobra_invalid_status'; end if;
  contract=lower(btrim(r->>'contract'));
  if contract !~ '^[a-z0-9_-]{3,80}$' then raise exception 'cobra_duplicate_or_invalid_contract'; end if;
  if r->>'created' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'cobra_invalid_date'; end if;
  created=(r->>'created')::date;
  if to_char(created,'YYYY-MM-DD')<>r->>'created' or date_trunc('month',created)::date<>new.cohort_month or created>new.cutoff then raise exception 'cobra_wrong_cohort'; end if;
  if public.cobra_quality_document(r->>'document') is null or length(r->>'customer') not between 1 and 240 or length(r->>'store') not between 1 and 160 then raise exception 'cobra_invalid_identity'; end if;
  foreach key in array array['financed_cents','fee_cents','total_installments','frequency','cycled','paid','overdue'] loop
   if jsonb_typeof(r->key) is distinct from 'number' or r->>key !~ '^[0-9]{1,16}$' or (r->>key)::numeric>9007199254740991 then raise exception 'cobra_invalid_count_or_amount'; end if;
  end loop;
  financed=(r->>'financed_cents')::bigint; fee=(r->>'fee_cents')::bigint;
  total=(r->>'total_installments')::integer; cycled=(r->>'cycled')::integer;paid=(r->>'paid')::integer;overdue=(r->>'overdue')::integer;
  if financed<=0 or fee<=0 or total not between 1 and 1000 or (r->>'frequency')::integer<>15 or cycled>total or paid>total or overdue<>greatest(0,cycled-paid) or fee::numeric*total>9007199254740991 then raise exception 'cobra_invalid_installments'; end if;
  -- RLS of the source is retained. No additional access to liquidations is granted.
  matched=source_map->contract;
  if coalesce((matched->>'matches')::integer,0)<>1 then raise exception 'cobra_contract_not_uniquely_accessible'; end if;
  op=jsonb_populate_record(null::public.liquidation_operations,matched->'operation');
  if not coalesce((matched->>'approved')::boolean,false) then raise exception 'cobra_source_not_approved'; end if;
  if nullif(op.normalized_data->>'fecha','') is null then business_date=(op.operation_at at time zone 'America/Bogota')::date;
  elsif op.normalized_data->>'fecha' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then business_date=(op.normalized_data->>'fecha')::date;
  elsif op.normalized_data->>'fecha' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' then business_date=((op.normalized_data->>'fecha')::timestamptz at time zone 'America/Bogota')::date;
  else raise exception 'cobra_source_date_invalid'; end if;
  if public.cobra_quality_document(op.cliente_documento) is distinct from public.cobra_quality_document(r->>'document')
   or public.cobra_quality_fold(op.cliente_nombre) is distinct from public.cobra_quality_fold(r->>'customer')
   or public.cobra_quality_fold(op.establishment_name) is distinct from public.cobra_quality_fold(r->>'store')
   or business_date is distinct from created or op.monto_credito*100 is distinct from financed::numeric then raise exception 'cobra_identity_or_terms_mismatch'; end if;
  expected=least(total,greatest(0,(new.cutoff-created)/15));
  due_date=case when paid>=total then null else created+(paid+1)*15 end;
  canonical_rows=array_append(canonical_rows,jsonb_build_object('operation_id',op.id,'contract',contract,'document',public.cobra_quality_document(op.cliente_documento),'customer',op.cliente_nombre,'store',op.establishment_name,'origin',op.origen_codigo,'created',created,'financed_cents',financed,'fee_cents',fee,'total_installments',total,'frequency',15,'cycled',cycled,'paid',paid,'overdue',overdue,'cycled_cents',fee*cycled,'arrears_cents',fee*overdue,'expected_cycles',expected,'calendar_mismatch',expected<>cycled,'calendar_due',due_date));
 end loop;
 canonical=to_jsonb(canonical_rows);
 select jsonb_object_agg(x->>'operation_id',true) into new.link_keys from jsonb_array_elements(canonical) x;
 if (select sum((x->>'cycled_cents')::numeric) from jsonb_array_elements(canonical) x)>9007199254740991 or (select sum((x->>'arrears_cents')::numeric) from jsonb_array_elements(canonical) x)>9007199254740991 then raise exception 'cobra_total_overflow'; end if;
 new.payload_sha256=encode(sha256(convert_to(new.source_rows::text,'UTF8')),'hex');
 new.observations=canonical;new.row_count=count_rows;new.received_by=auth.uid();new.received_at=clock_timestamp();new.schema_version=1;
 return new;
end;
$$;
revoke all on function public.cobra_krediya_prepare_cut() from public,anon,authenticated,service_role;
create trigger cobra_krediya_prepare_cut before insert on public.cobra_krediya_cuts for each row execute function public.cobra_krediya_prepare_cut();

create function public.cobra_krediya_link_cut()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 insert into public.cobra_krediya_cut_operations(cut_id,operation_id)
 select new.id,(r->>'operation_id')::uuid from jsonb_array_elements(new.observations) r;
 return new;
end;
$$;
revoke all on function public.cobra_krediya_link_cut() from public,anon,authenticated,service_role;
create trigger cobra_krediya_link_cut after insert on public.cobra_krediya_cuts for each row execute function public.cobra_krediya_link_cut();

-- Read-only canonical fingerprint for crash recovery; exposes no stored source rows.
create function public.cobra_krediya_payload_digest(p_rows jsonb)
returns text language plpgsql stable security invoker set search_path='' as $$begin
 if not coalesce(public.cobra_quality_importer(),false) then raise exception 'cobra_not_authorized' using errcode='42501'; end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 10000 or octet_length(p_rows::text)>8000000 then raise exception 'cobra_rows_limit'; end if;
 return encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
end$$;
revoke all on function public.cobra_krediya_payload_digest(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.cobra_krediya_payload_digest(jsonb) to authenticated;

create function public.cobra_krediya_save_cut(p_request_id uuid,p_file_sha256 text,p_cohort_month date,p_cutoff date,p_source_name text,p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c record; wanted_hash text; saved uuid;
begin
 if not coalesce(public.cobra_quality_importer(),false) then raise exception 'cobra_not_authorized' using errcode='42501'; end if;
 if p_request_id is null or p_file_sha256 is null or p_file_sha256 !~ '^[0-9a-f]{64}$' or p_cohort_month is null or p_cutoff is null or p_source_name is null or length(p_source_name) not between 1 and 180 or p_rows is null or jsonb_typeof(p_rows)<>'array' or octet_length(p_rows::text)>8000000 then raise exception 'cobra_invalid_request'; end if;
 wanted_hash=encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
 select id,request_id,file_sha256,payload_sha256,cohort_month,cutoff,row_count,received_at into c from public.cobra_krediya_cuts where request_id=p_request_id or (file_sha256=p_file_sha256 and cohort_month=p_cohort_month and cutoff=p_cutoff) order by (request_id=p_request_id) desc,received_at limit 1;
 if c.id is null then
  insert into public.cobra_krediya_cuts(request_id,file_sha256,cohort_month,cutoff,source_name,source_rows)
  values(p_request_id,p_file_sha256,p_cohort_month,p_cutoff,p_source_name,p_rows)
  on conflict do nothing returning id into saved;
  select id,request_id,file_sha256,payload_sha256,cohort_month,cutoff,row_count,received_at into c from public.cobra_krediya_cuts where id=saved or request_id=p_request_id or (file_sha256=p_file_sha256 and cohort_month=p_cohort_month and cutoff=p_cutoff) order by (request_id=p_request_id) desc,received_at limit 1;
 end if;
 if c.id is null or c.file_sha256 is distinct from p_file_sha256 or c.cohort_month is distinct from p_cohort_month or c.cutoff is distinct from p_cutoff or c.payload_sha256 is distinct from wanted_hash then raise exception 'cobra_idempotency_conflict'; end if;
 if (select count(*) from public.cobra_krediya_cut_operations where cut_id=c.id)<>c.row_count then raise exception 'cobra_incomplete_cut'; end if;
 return jsonb_build_object('id',c.id,'request_id',c.request_id,'row_count',c.row_count,'cutoff',c.cutoff,'cohort_month',c.cohort_month,'file_sha256',c.file_sha256,'duplicate',saved is null,'status','observations_saved','official_quality',false);
end;
$$;
revoke all on function public.cobra_krediya_save_cut(uuid,text,date,date,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.cobra_krediya_save_cut(uuid,text,date,date,text,jsonb) to authenticated;

create function public.cobra_krediya_immutable()
returns trigger language plpgsql security invoker set search_path='' as $$begin
 raise exception 'cobra_history_immutable' using errcode='42501';
end$$;
revoke all on function public.cobra_krediya_immutable() from public,anon,authenticated,service_role;
create trigger cobra_cuts_immutable before update or delete on public.cobra_krediya_cuts for each row execute function public.cobra_krediya_immutable();
create trigger cobra_cuts_no_truncate before truncate on public.cobra_krediya_cuts for each statement execute function public.cobra_krediya_immutable();
create trigger cobra_links_immutable before update or delete on public.cobra_krediya_cut_operations for each row execute function public.cobra_krediya_immutable();
create trigger cobra_links_no_truncate before truncate on public.cobra_krediya_cut_operations for each statement execute function public.cobra_krediya_immutable();

comment on table public.cobra_krediya_cuts is 'Immutable user-reported provider snapshots, not payment transactions, official quality certification or loan balances. File hash is provenance supplied by importer, not provider attestation.';
comment on table public.cobra_krediya_cut_operations is 'References existing liquidations only; creates neither loans nor collection obligations.';
commit;

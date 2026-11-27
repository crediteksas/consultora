-- Cartera conserva la tienda informada por KrediYA. No modifica liquidaciones ni tiendas.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
do $check$
begin
 if md5(pg_catalog.pg_get_functiondef('public.cobra_krediya_prepare_cut()'::regprocedure)) <> '068b76530485172733853b40bf54df43'
 or not exists (select 1 from pg_catalog.pg_proc p where p.oid='public.cobra_krediya_prepare_cut()'::regprocedure and not p.prosecdef and pg_catalog.pg_get_userbyid(p.proowner)='postgres' and p.proacl::text='{postgres=X/postgres}')
 then raise exception 'cobra_corte_preflight_changed';end if;
end $check$;
CREATE OR REPLACE FUNCTION public.cobra_krediya_prepare_cut()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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

   or business_date is distinct from created or op.monto_credito*100 is distinct from financed::numeric then raise exception 'cobra_identity_or_terms_mismatch'; end if;
  expected=least(total,greatest(0,(new.cutoff-created)/15));
  due_date=case when paid>=total then null else created+(paid+1)*15 end;
  canonical_rows=array_append(canonical_rows,jsonb_build_object('operation_id',op.id,'contract',contract,'document',public.cobra_quality_document(op.cliente_documento),'customer',op.cliente_nombre,'store',btrim(r->>'store'),'origin',op.origen_codigo,'created',created,'financed_cents',financed,'fee_cents',fee,'total_installments',total,'frequency',15,'cycled',cycled,'paid',paid,'overdue',overdue,'cycled_cents',fee*cycled,'arrears_cents',fee*overdue,'expected_cycles',expected,'calendar_mismatch',expected<>cycled,'calendar_due',due_date));
 end loop;
 canonical=to_jsonb(canonical_rows);
 select jsonb_object_agg(x->>'operation_id',true) into new.link_keys from jsonb_array_elements(canonical) x;
 if (select sum((x->>'cycled_cents')::numeric) from jsonb_array_elements(canonical) x)>9007199254740991 or (select sum((x->>'arrears_cents')::numeric) from jsonb_array_elements(canonical) x)>9007199254740991 then raise exception 'cobra_total_overflow'; end if;
 new.payload_sha256=encode(sha256(convert_to(new.source_rows::text,'UTF8')),'hex');
 new.observations=canonical;new.row_count=count_rows;new.received_by=auth.uid();new.received_at=clock_timestamp();new.schema_version=1;
 return new;
end;
$function$;
do $check$
declare f text;
begin
 f:=pg_catalog.pg_get_functiondef('public.cobra_krediya_prepare_cut()'::regprocedure);
 if position('''store'', btrim(r ->> ''store''::text)' in f)=0
 and position('''store'',btrim(r->>''store'')' in f)=0
 then raise exception 'cobra_corte_store_not_from_file';end if;
 if position('cobra_quality_fold(op.establishment_name)' in f)>0
 or not exists (select 1 from pg_catalog.pg_proc p where p.oid='public.cobra_krediya_prepare_cut()'::regprocedure and not p.prosecdef and pg_catalog.pg_get_userbyid(p.proowner)='postgres' and p.proacl::text='{postgres=X/postgres}')
 then raise exception 'cobra_corte_postflight_changed';end if;
end $check$;
notify pgrst,'reload schema';
commit;

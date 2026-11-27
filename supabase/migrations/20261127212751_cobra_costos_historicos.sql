-- Historical portfolio costs are an analytical record, not a bank payment.
begin;
-- Do not change a live restricted-session catalog without its own full proof.
do $$ begin
 if exists(select 1 from kora_private.cartera_contract where enabled)
    or exists(select 1 from kora_private.cartera_principals)
 then raise exception 'cobra_coverage_dedicated_contract_requires_separate_review';end if;
end $$;
-- Access is an explicit allowlist, separate from store assignments and profiles.
create table kora_private.cobra_cobertura_autorizados (
 user_id uuid primary key references public.perfiles(id) on delete restrict
);
revoke all on kora_private.cobra_cobertura_autorizados from public,anon,authenticated,service_role,kora_cartera_session,kora_cartera_operator;
alter table kora_private.cobra_cobertura_autorizados enable row level security;
create table kora_private.cobra_cobertura_historica (
 id uuid primary key default gen_random_uuid(),
 credit_id text not null check (credit_id ~ '^[a-zA-Z0-9_-]{1,80}$'),
 platform text not null default 'krediya' check(platform='krediya'),
 cohort_month date not null check (extract(day from cohort_month)=1),
 kind text not null check (kind in ('installments','cancellation')),
 amount_pesos bigint not null check (amount_pesos>0 and amount_pesos<=90071992547409),
 effective_date date,
 source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
 source_row integer not null check (source_row>0),
 source_name text not null check (length(source_name) between 1 and 160),
 source_note text check (source_note is null or length(source_note)<=300),
 recorded_by uuid not null references public.perfiles(id),
 recording_method text not null default 'user_session' check(recording_method in ('user_session','asistente_autorizado')),
 recorded_at timestamptz not null default now(),
 unique (source_sha256,source_row,kind)
);
revoke all on kora_private.cobra_cobertura_historica from public,anon,authenticated,service_role,kora_cartera_session,kora_cartera_operator;
alter table kora_private.cobra_cobertura_historica enable row level security;
create function kora_private.cobra_cobertura_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'cobra_historical_immutable';end$$;
create trigger cobra_cobertura_no_update before update or delete on kora_private.cobra_cobertura_historica for each row execute function kora_private.cobra_cobertura_immutable();
create trigger cobra_cobertura_no_truncate before truncate on kora_private.cobra_cobertura_historica for each statement execute function kora_private.cobra_cobertura_immutable();
revoke all on function kora_private.cobra_cobertura_immutable() from public,anon,authenticated,service_role,kora_cartera_session,kora_cartera_operator;

-- An erroneous historical entry can be superseded only by a separate, auditable event.
create table kora_private.cobra_cobertura_correcciones(
 id uuid primary key default gen_random_uuid(),
 target_id uuid not null unique references kora_private.cobra_cobertura_historica(id) on delete restrict,
 reason text not null check(length(btrim(reason)) between 5 and 600),
 source_sha256 text not null check(source_sha256 ~ '^[0-9a-f]{64}$'),
 source_name text not null check(length(btrim(source_name)) between 1 and 160),
 recorded_by uuid not null references public.perfiles(id),
 recorded_at timestamptz not null default now()
);
revoke all on kora_private.cobra_cobertura_correcciones from public,anon,authenticated,service_role,kora_cartera_session,kora_cartera_operator;
alter table kora_private.cobra_cobertura_correcciones enable row level security;
create trigger cobra_correccion_no_update before update or delete on kora_private.cobra_cobertura_correcciones for each row execute function kora_private.cobra_cobertura_immutable();
create trigger cobra_correccion_no_truncate before truncate on kora_private.cobra_cobertura_correcciones for each statement execute function kora_private.cobra_cobertura_immutable();

-- Serialize duplicate checks per provider credit; corrections do not erase history.
create function kora_private.cobra_cobertura_duplicate_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if pg_catalog.current_setting('transaction_isolation')<>'read committed' then raise exception 'cobra_coverage_requires_read_committed';end if;
 if not exists(select 1 from kora_private.cobra_cobertura_autorizados a join public.perfiles p on p.id=a.user_id where a.user_id=new.recorded_by and p.activo) then raise exception 'cobra_coverage_recorder_not_authorized' using errcode='42501';end if;
 new.recorded_at=pg_catalog.clock_timestamp();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.platform||':'||pg_catalog.lower(new.credit_id),0));
 if exists(select 1 from kora_private.cobra_cobertura_historica h where h.platform=new.platform and pg_catalog.lower(h.credit_id)=pg_catalog.lower(new.credit_id) and h.kind=new.kind and (new.kind='cancellation' or (h.cohort_month=new.cohort_month and h.amount_pesos=new.amount_pesos and h.effective_date is not distinct from new.effective_date)) and not exists(select 1 from kora_private.cobra_cobertura_correcciones c where c.target_id=h.id)) then
  raise exception 'cobra_coverage_active_duplicate' using errcode='23505';
 end if;
 return new;
end$$;
revoke all on function kora_private.cobra_cobertura_duplicate_guard() from public,anon,authenticated,service_role,kora_cartera_session,kora_cartera_operator;
create trigger cobra_cobertura_guard_insert before insert on kora_private.cobra_cobertura_historica for each row execute function kora_private.cobra_cobertura_duplicate_guard();

-- Corrections and new entries for the same credit use the same transaction lock.
create function kora_private.cobra_cobertura_correction_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare target_platform text;target_credit text;
begin
 if pg_catalog.current_setting('transaction_isolation')<>'read committed' then raise exception 'cobra_coverage_requires_read_committed';end if;
 if not exists(select 1 from kora_private.cobra_cobertura_autorizados a join public.perfiles p on p.id=a.user_id where a.user_id=new.recorded_by and p.activo) then raise exception 'cobra_coverage_recorder_not_authorized' using errcode='42501';end if;
 new.recorded_at=pg_catalog.clock_timestamp();
 select h.platform,h.credit_id into target_platform,target_credit from kora_private.cobra_cobertura_historica h where h.id=new.target_id;
 if not found then raise exception 'cobra_coverage_target_missing' using errcode='23503';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_platform||':'||pg_catalog.lower(target_credit),0));
 return new;
end$$;
revoke all on function kora_private.cobra_cobertura_correction_guard() from public,anon,authenticated,service_role,kora_cartera_session,kora_cartera_operator;
create trigger cobra_cobertura_guard_correction before insert on kora_private.cobra_cobertura_correcciones for each row execute function kora_private.cobra_cobertura_correction_guard();

-- The only exported data are the monthly sums and narrowly scoped event details.
create function kora_private.cobra_cobertura_calcular() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from pg_catalog.pg_roles where rolname=current_user and (rolbypassrls or rolsuper)) then raise exception 'cobra_coverage_rls_owner_invalid' using errcode='42501';end if;
 if not coalesce(public.cobra_quality_operator(),false) or coalesce(kora_cartera_policy.cartera_principal_restringido(),true) or not exists(select 1 from kora_private.cobra_cobertura_autorizados a join public.perfiles p on p.id=a.user_id where a.user_id=(select auth.uid()) and p.activo) then raise exception 'cobra_coverage_not_authorized' using errcode='42501'; end if;
 if (select count(*) from kora_private.cobra_cobertura_historica)>10000 then raise exception 'cobra_coverage_scope_required';end if;
 with sources as (
  select o.id,o.external_id,
   case when nullif(o.normalized_data->>'fecha','') is null then (o.operation_at at time zone 'America/Bogota')::date
        when o.normalized_data->>'fecha' ~ '^\d{4}-\d{2}-\d{2}$' then (o.normalized_data->>'fecha')::date
        when o.normalized_data->>'fecha' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?([Zz]|[+-][0-9]{2}:[0-9]{2})$' then ((o.normalized_data->>'fecha')::timestamptz at time zone 'America/Bogota')::date
        when o.normalized_data->>'fecha' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?$' then (o.normalized_data->>'fecha')::timestamp::date
        else null end as venta,
   case when o.policy_snapshot#>>'{krediya_v2,provision}' ~ '^-?[0-9]+(\.[0-9]{1,2})?$' then (o.policy_snapshot#>>'{krediya_v2,provision}')::numeric else null end provision,
   exists(select 1 from public.aliados_reversiones r where r.original_operation_id=o.id) reversed
  from public.liquidation_operations o join public.liquidations l on l.id=o.liquidation_id
  where o.plataforma='krediya' and o.reconocida and l.approved_at is not null and l.approved_by is not null and l.frozen_at is not null
 ), source_counts as (
  select lower(external_id) credit_id,count(*) n,min(date_trunc('month',venta)::date) mes,bool_or(reversed) any_reversed
  from sources group by lower(external_id)
 ), active_costs as (
  select h.* from kora_private.cobra_cobertura_historica h
  where not exists(select 1 from kora_private.cobra_cobertura_correcciones x where x.target_id=h.id)
 ), active_credit_ids as (
  select distinct lower(credit_id) credit_id from active_costs
 ), generated as (
  select date_trunc('month',s.venta)::date mes,count(*) operaciones,count(*) filter(where s.provision is null) incompletas,count(*) filter(where s.reversed) reversiones,count(*) filter(where c.n>1) duplicadas,sum(s.provision) provision
  from sources s left join source_counts c on c.credit_id=lower(s.external_id) where s.venta is not null group by 1
 ), costs as (
  select h.cohort_month mes,sum(h.amount_pesos) filter(where h.kind='installments') cuotas,sum(h.amount_pesos) filter(where h.kind='cancellation') anulaciones,count(*) eventos,count(*) filter(where c.n is distinct from 1 or c.mes is distinct from h.cohort_month or c.any_reversed) sin_vinculo
  from active_costs h left join source_counts c on c.credit_id=lower(h.credit_id) group by h.cohort_month
 ), live_costs as (
  select coalesce(r.cohort_month,e.cohort_month) mes,sum(e.amount_cents)::numeric/100 gastos,
   count(*) filter (where r.id is null or s.id is null or date_trunc('month',s.venta)::date is distinct from r.cohort_month or s.reversed) usos_sin_vinculo,
   count(*) filter (where ac.credit_id is not null) posibles_duplicados
  from public.cobra_provision_actions e left join public.cobra_provision_actions r on r.id=e.parent_id and r.kind='request'
  left join sources s on s.id=r.operation_id left join active_credit_ids ac on ac.credit_id=lower(s.external_id)
  where e.kind='execute' group by coalesce(r.cohort_month,e.cohort_month)
 ), prior as (
  select source_month mes,sum(prior_used_cents)::numeric/100 sin_asignar from public.cobra_provision_fundings group by source_month
 ), months as (select mes from generated union select mes from costs union select mes from live_costs union select mes from prior),
 entries as (
  select m.mes,g.operaciones,coalesce(g.incompletas,0) incompletas,coalesce(g.reversiones,0) reversiones,coalesce(g.duplicadas,0) duplicadas,g.provision,
   coalesce(c.cuotas,0) cuotas,coalesce(c.anulaciones,0) anulaciones,coalesce(c.eventos,0) eventos,coalesce(c.sin_vinculo,0)+coalesce(l.usos_sin_vinculo,0) sin_vinculo,
   coalesce(l.gastos,0) gastos_nuevos,coalesce(l.posibles_duplicados,0) posibles_duplicados,coalesce(p.sin_asignar,0) historico_sin_asignar
  from months m left join generated g on g.mes=m.mes left join costs c on c.mes=m.mes left join live_costs l on l.mes=m.mes left join prior p on p.mes=m.mes
 )
 select jsonb_build_object('version',1,'invalid_dates',(select count(*) from sources where venta is null),'items',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'credit',h.credit_id,'month',h.cohort_month,'kind',h.kind,'amount_pesos',h.amount_pesos,'effective_date',h.effective_date,'source_name',h.source_name,'source_row',h.source_row,'source_note',h.source_note) order by h.cohort_month,h.recorded_at,h.id),'[]'::jsonb) from kora_private.cobra_cobertura_historica h where not exists(select 1 from kora_private.cobra_cobertura_correcciones x where x.target_id=h.id)),'months',coalesce(jsonb_agg(jsonb_build_object('month',mes,'operations',operaciones,'missing',incompletas,'reversals',reversiones,'duplicates',duplicadas,'unmatched',sin_vinculo,'provision_pesos',case when incompletas=0 and reversiones=0 and duplicadas=0 then round(provision)::bigint else null end,'installments_pesos',cuotas,'cancellations_pesos',anulaciones,'new_uses_pesos',round(gastos_nuevos)::bigint,'potential_duplicates',posibles_duplicados,'unallocated_prior_pesos',round(historico_sin_asignar)::bigint,'events',eventos) order by mes),'[]'::jsonb)) into result from entries;
 if (result->>'invalid_dates')::integer>0 then raise exception 'cobra_coverage_date_incomplete';end if;
 return result;
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then raise exception 'cobra_coverage_date_incomplete';
end$$;
revoke all on function kora_private.cobra_cobertura_calcular() from public,anon,authenticated,service_role,kora_cartera_session,kora_cartera_operator;

-- Ordinary corporate/portfolio sessions only. Restricted sessions must use their reviewed gateway.
create function public.cobra_cobertura_mensual() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(public.cobra_quality_operator(),false) or coalesce(kora_cartera_policy.cartera_principal_restringido(),true) then raise exception 'cobra_coverage_not_authorized' using errcode='42501';end if;
 return kora_private.cobra_cobertura_calcular();
end$$;
revoke all on function public.cobra_cobertura_mensual() from public,anon,authenticated,service_role,kora_cartera_session,kora_cartera_operator;
grant execute on function public.cobra_cobertura_mensual() to authenticated;

-- Use the existing, independently authorized Cartera route so a store's debt
-- confirmation never becomes a prerequisite for this portfolio-only view.
do $book_preflight$ begin
 if md5(pg_catalog.pg_get_functiondef('public.cobra_provision_book()'::regprocedure))<>'42d7cdce1b340a6072f2c83a0615df6e'
 or not exists(select 1 from pg_catalog.pg_proc p where p.oid='public.cobra_provision_book()'::regprocedure and pg_catalog.pg_get_userbyid(p.proowner)='postgres' and not p.prosecdef and p.proacl::text='{postgres=X/postgres,authenticated=X/postgres}')
 then raise exception 'cobra_coverage_book_preflight_changed';end if;
end $book_preflight$;
create or replace function public.cobra_provision_book() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare f jsonb;a jsonb;coverage jsonb;coverage_error boolean=false;
begin
 if not coalesce(public.cobra_quality_operator(),false) then raise exception 'cobra_fund_not_authorized' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.source_month,x.id),'[]') into f from public.cobra_provision_fundings x;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.event_no),'[]') into a from public.cobra_provision_actions x;
 if jsonb_array_length(f)>10000 or jsonb_array_length(a)>10000 then raise exception 'cobra_fund_book_too_large';end if;
 -- Missing coverage or its authorization never changes the existing fund book.
 begin coverage=public.cobra_cobertura_mensual(); exception when insufficient_privilege then coverage=null; when others then coverage=null;coverage_error=true;end;
 if coverage is not null then return jsonb_build_object('fundings',f,'actions',a,'coverage',coverage);end if;
 if coverage_error then return jsonb_build_object('fundings',f,'actions',a,'coverage_status','error');end if;
 return jsonb_build_object('fundings',f,'actions',a);
end$$;
do $book_postflight$ begin
 if not exists(select 1 from pg_catalog.pg_proc p where p.oid='public.cobra_provision_book()'::regprocedure and pg_catalog.pg_get_userbyid(p.proowner)='postgres' and not p.prosecdef and p.proacl::text='{postgres=X/postgres,authenticated=X/postgres}')
 then raise exception 'cobra_coverage_book_postflight_changed';end if;
end $book_postflight$;
comment on table kora_private.cobra_cobertura_historica is 'Historical costs reported for KrediYA. No bank transfer, customer payment, store debt or settlement is created.';
commit;

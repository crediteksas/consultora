-- Administrative reconciliation only: original sales, cash closures and stock remain immutable.
begin;
create table inventario_control.ventas_fechas_conciliadas (
 venta_id uuid primary key references public.ventas(id),
 corte_id uuid not null references inventario_control.cortes(id),
 venta_hash text not null check(length(venta_hash)=32),
 fecha_original date,
 registrada_at timestamptz not null,
 fecha_conciliada date not null,
 autorizado_por uuid not null references public.perfiles(id),
 motivo text not null check(length(btrim(motivo))>=15),
 request_id uuid not null,
 created_at timestamptz not null default now(),
 check(fecha_conciliada=(registrada_at at time zone 'America/Bogota')::date)
);
alter table inventario_control.ventas_fechas_conciliadas enable row level security;
revoke all on inventario_control.ventas_fechas_conciliadas from public,anon,authenticated,service_role;
create trigger ventas_fechas_conciliadas_inmutables before update or delete on inventario_control.ventas_fechas_conciliadas
 for each row execute function inventario_control.socios_inmutable();
create trigger ventas_fechas_conciliadas_no_truncate before truncate on inventario_control.ventas_fechas_conciliadas
 for each statement execute function inventario_control.socios_inmutable();

-- The full-row fingerprint intentionally fails closed after any sale-schema/source change.
-- Future recreations of cierre_utilidad_api must retain this migration and its regression test.
-- Preserve the current function, including its ACL and all other calculation rules.
-- Only the inconsistent-date check accepts an exact, audited original-sale snapshot.
do $patch$
declare original text; expected text; replacement text;
begin
 if (select relowner from pg_class where oid='inventario_control.ventas_fechas_conciliadas'::regclass)
   is distinct from (select proowner from pg_proc where oid='inventario_control.cierre_utilidad_api(text,uuid,text)'::regprocedure) then
  raise exception 'Ledger and calculation owners differ: review RLS visibility';end if;
 original:=pg_get_functiondef('inventario_control.cierre_utilidad_api(text,uuid,text)'::regprocedure);
 expected:=$old$  select count(*),count(*) filter(where v.fecha is null or v.fecha<=v_inicio_dia or v.fecha>=v_fin_dia)
    into v_fechas_venta_inconsistentes,v_fechas_venta_limite from public.ventas v
    where v.tienda_codigo=v_corte.tienda_codigo and not coalesce(v.anulada,false)
      and v.created_at>=v_inicio and v.created_at<v_fin
      and v.fecha is distinct from (v.created_at at time zone 'America/Bogota')::date;$old$;
 replacement:=$new$  select count(*),count(*) filter(where coalesce(f.fecha_conciliada,v.fecha) is null
      or coalesce(f.fecha_conciliada,v.fecha)<=v_inicio_dia or coalesce(f.fecha_conciliada,v.fecha)>=v_fin_dia)
    into v_fechas_venta_inconsistentes,v_fechas_venta_limite from public.ventas v
    left join inventario_control.ventas_fechas_conciliadas f on f.venta_id=v.id
      and f.corte_id=p_corte_id and f.venta_hash=md5(to_jsonb(v)::text) and v.total=0 and not coalesce(v.anulada,false)
      and f.fecha_original is not distinct from v.fecha and f.registrada_at=v.created_at
    where v.tienda_codigo=v_corte.tienda_codigo and not coalesce(v.anulada,false)
      and v.created_at>=v_inicio and v.created_at<v_fin
      and coalesce(f.fecha_conciliada,v.fecha) is distinct from (v.created_at at time zone 'America/Bogota')::date;$new$;
 if strpos(original,expected)=0 or strpos(substr(original,strpos(original,expected)+length(expected)),expected)>0 then
  raise exception 'Inventory date-check source changed: review before applying reconciliation';
 end if;
 execute replace(original,expected,replacement);
end;
$patch$;
commit;

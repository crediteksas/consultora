-- Reparto uniforme hasta disponer de histórico diario real verificado.
create or replace function public.proponer_presupuesto_manual(
  p_tienda text,
  p_mes date,
  p_metrica text,
  p_pct_crecimiento numeric default 0
)
returns table(fecha date, base_anterior numeric, meta_propuesta numeric, fuente text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inicio date := date_trunc('month', p_mes)::date;
  v_fin date := (date_trunc('month', p_mes) + interval '1 month')::date;
  v_inicio_hist date := (date_trunc('month', p_mes) - interval '1 year')::date;
  v_fin_hist date := (date_trunc('month', p_mes) - interval '11 months')::date;
  v_total numeric := 0;
  v_dias integer := extract(day from (date_trunc('month', p_mes) + interval '1 month - 1 day'))::integer;
begin
  if public.rol_actual() is null or not public.es_central() then
    raise exception 'Solo gerencia o auditoría pueden preparar presupuestos';
  end if;
  if p_tienda is null or p_mes is null then raise exception 'Faltan tienda o mes'; end if;
  if not exists (
    select 1 from public.origenes o
    where o.codigo = p_tienda and o.tipo = 'propia' and o.activo
  ) then
    raise exception 'La tienda no pertenece al catálogo Retail activo';
  end if;
  if p_metrica not in ('meta_venta_total','meta_creditos','meta_uds_cel','meta_uds_acc','meta_utilidad') then
    raise exception 'Métrica no permitida';
  end if;
  if p_pct_crecimiento < 0 or p_pct_crecimiento > 1000 then
    raise exception 'El crecimiento debe estar entre 0 y 1000 por ciento';
  end if;

  -- Si solo existe el total mensual, se reparte uniformemente entre todos
  -- los días calendario del mes usando diferencias acumuladas, sin días negativos.
  select coalesce(case p_metrica
    when 'meta_venta_total' then hm.venta_total
    when 'meta_creditos' then hm.cred_uds
    when 'meta_uds_cel' then hm.cel_uds
    when 'meta_uds_acc' then hm.acc_uds
    when 'meta_utilidad' then hm.utilidad_neta
  end, 0)::numeric into v_total
  from public.historico_mensual hm
  where hm.tienda_codigo = p_tienda
    and hm.anio = extract(year from v_inicio_hist)::integer
    and hm.mes = extract(month from v_inicio_hist)::integer;

  -- La existencia de varias fechas importadas no acredita un histórico diario real.
  -- Si falta el consolidado mensual, sumar la fuente disponible y repartir el total.
  if v_total is null then
    select sum(case p_metrica
      when 'meta_venta_total' then h.venta_total
      when 'meta_creditos' then h.creditos
      when 'meta_uds_cel' then h.equipos_contado_cantidad
      when 'meta_uds_acc' then h.accesorios_cantidad
      when 'meta_utilidad' then h.utilidad_neta end)
    into v_total from public.historico_importado h
    where h.tienda_codigo=p_tienda and h.fecha>=v_inicio_hist and h.fecha<v_fin_hist;
  end if;
  if v_total is null and p_metrica='meta_venta_total' then
    select sum(v.total) into v_total from public.ventas v
    where v.tienda_codigo=p_tienda and v.fecha>=v_inicio_hist and v.fecha<v_fin_hist
      and not coalesce(v.anulada,false);
  end if;
  v_total := coalesce(v_total, 0);
  return query
  with dias as (
    select d::date as fecha, row_number() over (order by d)::integer as rn
    from generate_series(v_inicio, v_fin - 1, interval '1 day') d
  )
  select d.fecha,
    round(v_total * d.rn / v_dias) - round(v_total * (d.rn - 1) / v_dias),
    round(round(v_total * ((100.0 + p_pct_crecimiento) / 100.0)) * d.rn / v_dias)
      - round(round(v_total * ((100.0 + p_pct_crecimiento) / 100.0)) * (d.rn - 1) / v_dias),
    'histórico mensual uniforme por tienda_codigo'::text
  from dias d
  order by d.fecha;
end;
$$;

-- Respaldo auditable de los presupuestos mensuales importados concentrados en día 1.
create table presupuestos_control_private.respaldo_reparto_mensual_20261002 (
  presupuesto_id uuid primary key,
  original jsonb not null,
  respaldado_at timestamptz not null default now()
);
alter table presupuestos_control_private.respaldo_reparto_mensual_20261002 enable row level security;
revoke all on presupuestos_control_private.respaldo_reparto_mensual_20261002 from public,anon,authenticated;
lock table public.presupuestos in share row exclusive mode;
insert into presupuestos_control_private.respaldo_reparto_mensual_20261002
select p.id,to_jsonb(p),now() from public.presupuestos p
where p.generado_desde='excel_2025' and p.fecha=date_trunc('month',p.fecha)::date
and not exists(select 1 from public.presupuestos other where other.tienda_codigo=p.tienda_codigo
  and date_trunc('month',other.fecha)=date_trunc('month',p.fecha) and other.id<>p.id);

with originales as (
  select (jsonb_populate_record(null::public.presupuestos,original)).*
  from presupuestos_control_private.respaldo_reparto_mensual_20261002
), dias as (
  select p.*,d::date dia,extract(day from d)::numeric rn,
    extract(day from (p.fecha+interval '1 month - 1 day'))::numeric nd
  from originales p cross join lateral generate_series(p.fecha,p.fecha+interval '1 month - 1 day',interval '1 day') d
)
insert into public.presupuestos(tienda_codigo,fecha,meta_creditos,meta_uds_cel,meta_uds_acc,meta_venta_total,generado_desde)
select tienda_codigo,dia,
  round(meta_creditos*rn/nd)-round(meta_creditos*(rn-1)/nd),
  round(meta_uds_cel*rn/nd)-round(meta_uds_cel*(rn-1)/nd),
  round(meta_uds_acc*rn/nd)-round(meta_uds_acc*(rn-1)/nd),
  round(meta_venta_total*rn/nd,2)-round(meta_venta_total*(rn-1)/nd,2),
  'excel_2025:reparto_uniforme'
from dias
on conflict(tienda_codigo,fecha) do update set
  meta_creditos=excluded.meta_creditos,meta_uds_cel=excluded.meta_uds_cel,
  meta_uds_acc=excluded.meta_uds_acc,meta_venta_total=excluded.meta_venta_total,
  generado_desde=excluded.generado_desde;

do $$
begin
 if exists(
   select 1 from presupuestos_control_private.respaldo_reparto_mensual_20261002 b
   cross join lateral jsonb_populate_record(null::public.presupuestos,b.original) o
   cross join lateral(select sum(p.meta_creditos) cr,sum(p.meta_uds_cel) cel,sum(p.meta_uds_acc) acc,sum(p.meta_venta_total) venta,count(*) n
     from public.presupuestos p where p.tienda_codigo=o.tienda_codigo
     and p.fecha>=o.fecha and p.fecha<o.fecha+interval '1 month') t
   where t.cr is distinct from o.meta_creditos or t.cel is distinct from o.meta_uds_cel
     or t.acc is distinct from o.meta_uds_acc or t.venta is distinct from o.meta_venta_total
     or t.n<>extract(day from o.fecha+interval '1 month - 1 day')
 ) then raise exception 'El reparto debe conservar los cuatro totales mensuales y completar todos los días';end if;
end $$;

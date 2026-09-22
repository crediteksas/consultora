-- Consolida el histórico diario importado en la fuente mensual canónica.
-- La llave es siempre tienda_codigo: no se cruzan nombres ni ciudades.
with mensual as (
  select
    h.tienda_codigo,
    extract(year from h.fecha)::integer as anio,
    extract(month from h.fecha)::integer as mes,
    extract(day from (date_trunc('month', h.fecha) + interval '1 month - 1 day'))::integer as dias_mes,
    coalesce(sum(h.equipos_contado_cantidad), 0)::integer as cel_uds,
    coalesce(sum(h.equipos_contado_venta), 0)::numeric as cel_venta,
    coalesce(sum(h.equipos_contado_costo), 0)::numeric as cel_costo,
    coalesce(sum(h.equipos_contado_utilidad), 0)::numeric as cel_utilidad,
    coalesce(sum(h.accesorios_cantidad), 0)::integer as acc_uds,
    coalesce(sum(h.accesorios_venta), 0)::numeric as acc_venta,
    coalesce(sum(h.accesorios_costo), 0)::numeric as acc_costo,
    coalesce(sum(h.accesorios_utilidad), 0)::numeric as acc_utilidad,
    coalesce(sum(h.creditos), 0)::integer as cred_uds,
    coalesce(sum(h.creditos_costo), 0)::numeric as cred_costo,
    coalesce(sum(h.creditos_utilidad), 0)::numeric as cred_utilidad,
    coalesce(sum(h.utilidad), 0)::numeric as utilidad_bruta,
    coalesce(sum(h.gastos), 0)::numeric as gastos,
    coalesce(sum(h.utilidad_neta), 0)::numeric as utilidad_neta,
    coalesce(sum(h.venta_total), 0)::numeric as venta_total
  from public.historico_importado h
  join public.origenes o
    on o.codigo = h.tienda_codigo
   and o.tipo = 'propia'
  where h.fecha >= date '2026-01-01'
    and h.fecha < date '2026-09-01'
  group by h.tienda_codigo, extract(year from h.fecha), extract(month from h.fecha),
    extract(day from (date_trunc('month', h.fecha) + interval '1 month - 1 day'))
)
insert into public.historico_mensual (
  tienda_codigo, anio, mes, dias_mes,
  cel_uds, cel_venta, cel_costo, cel_utilidad, cel_uds_dia, cel_venta_dia,
  acc_uds, acc_venta, acc_costo, acc_utilidad, acc_uds_dia, acc_venta_dia,
  cred_uds, cred_costo, cred_utilidad,
  utilidad_bruta, gastos, utilidad_neta, venta_total,
  venta_total_dia, utilidad_bruta_dia, gastos_dia, utilidad_neta_dia,
  generado_desde
)
select
  tienda_codigo, anio, mes, dias_mes,
  cel_uds, cel_venta, cel_costo, cel_utilidad,
  round(cel_uds::numeric / dias_mes, 4), round(cel_venta / dias_mes, 4),
  acc_uds, acc_venta, acc_costo, acc_utilidad,
  round(acc_uds::numeric / dias_mes, 4), round(acc_venta / dias_mes, 4),
  cred_uds, cred_costo, cred_utilidad,
  utilidad_bruta, gastos, utilidad_neta, venta_total,
  round(venta_total / dias_mes, 4), round(utilidad_bruta / dias_mes, 4),
  round(gastos / dias_mes, 4), round(utilidad_neta / dias_mes, 4),
  'historico_importado:2026-consolidado'
from mensual
on conflict (tienda_codigo, anio, mes) do update set
  dias_mes = excluded.dias_mes,
  cel_uds = excluded.cel_uds,
  cel_venta = excluded.cel_venta,
  cel_costo = excluded.cel_costo,
  cel_utilidad = excluded.cel_utilidad,
  cel_uds_dia = excluded.cel_uds_dia,
  cel_venta_dia = excluded.cel_venta_dia,
  acc_uds = excluded.acc_uds,
  acc_venta = excluded.acc_venta,
  acc_costo = excluded.acc_costo,
  acc_utilidad = excluded.acc_utilidad,
  acc_uds_dia = excluded.acc_uds_dia,
  acc_venta_dia = excluded.acc_venta_dia,
  cred_uds = excluded.cred_uds,
  cred_costo = excluded.cred_costo,
  cred_utilidad = excluded.cred_utilidad,
  utilidad_bruta = excluded.utilidad_bruta,
  gastos = excluded.gastos,
  utilidad_neta = excluded.utilidad_neta,
  venta_total = excluded.venta_total,
  venta_total_dia = excluded.venta_total_dia,
  utilidad_bruta_dia = excluded.utilidad_bruta_dia,
  gastos_dia = excluded.gastos_dia,
  utilidad_neta_dia = excluded.utilidad_neta_dia,
  generado_desde = excluded.generado_desde;

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
  v_hay_diario boolean := false;
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

  -- Ventas operativas: misma fuente y misma llave exacta del Dashboard Retail.
  if p_metrica = 'meta_venta_total' then
    select count(distinct v.fecha) > 1 into v_hay_diario
    from public.ventas v
    where v.tienda_codigo = p_tienda
      and v.fecha >= v_inicio_hist and v.fecha < v_fin_hist
      and coalesce(v.anulada, false) = false;
    if v_hay_diario then
      return query
      with dias as (
        select d::date as fecha from generate_series(v_inicio, v_fin - 1, interval '1 day') d
      ), base as (
        select extract(day from v.fecha)::integer as dia, sum(v.total)::numeric as valor
        from public.ventas v
        where v.tienda_codigo = p_tienda
          and v.fecha >= v_inicio_hist and v.fecha < v_fin_hist
          and coalesce(v.anulada, false) = false
        group by 1
      )
      select d.fecha, coalesce(b.valor, 0),
        round(coalesce(b.valor, 0) * ((100.0 + p_pct_crecimiento) / 100.0)),
        'ventas operativas por tienda_codigo'::text
      from dias d left join base b on b.dia = extract(day from d.fecha)::integer
      order by d.fecha;
      return;
    end if;
  end if;

  -- Histórico diario importado: también se cruza solo por tienda_codigo.
  select count(distinct h.fecha) > 1 into v_hay_diario
  from public.historico_importado h
  where h.tienda_codigo = p_tienda
    and h.fecha >= v_inicio_hist and h.fecha < v_fin_hist;
  if v_hay_diario then
    return query
    with dias as (
      select d::date as fecha from generate_series(v_inicio, v_fin - 1, interval '1 day') d
    ), base as (
      select extract(day from h.fecha)::integer as dia,
        sum(case p_metrica
          when 'meta_venta_total' then h.venta_total
          when 'meta_creditos' then h.creditos
          when 'meta_uds_cel' then h.equipos_contado_cantidad
          when 'meta_uds_acc' then h.accesorios_cantidad
          when 'meta_utilidad' then h.utilidad_neta
        end)::numeric as valor
      from public.historico_importado h
      where h.tienda_codigo = p_tienda
        and h.fecha >= v_inicio_hist and h.fecha < v_fin_hist
      group by 1
    )
    select d.fecha, coalesce(b.valor, 0),
      round(coalesce(b.valor, 0) * ((100.0 + p_pct_crecimiento) / 100.0)),
      'histórico diario por tienda_codigo'::text
    from dias d left join base b on b.dia = extract(day from d.fecha)::integer
    order by d.fecha;
    return;
  end if;

  -- Si solo existe el total mensual, se reparte uniformemente entre todos
  -- los días calendario del mes. El primer día absorbe únicamente el redondeo.
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

  v_total := coalesce(v_total, 0);
  return query
  with dias as (
    select d::date as fecha, row_number() over (order by d)::integer as rn
    from generate_series(v_inicio, v_fin - 1, interval '1 day') d
  ), calc as (
    select d.fecha, d.rn,
      round(v_total / nullif(v_dias, 0)) as base_dia,
      round((v_total * ((100.0 + p_pct_crecimiento) / 100.0)) / nullif(v_dias, 0)) as meta_dia
    from dias d
  ), sums as (
    select sum(base_dia) as suma_base, sum(meta_dia) as suma_meta from calc
  )
  select c.fecha,
    c.base_dia + case when c.rn = 1 then v_total - s.suma_base else 0 end,
    c.meta_dia + case when c.rn = 1
      then round(v_total * ((100.0 + p_pct_crecimiento) / 100.0)) - s.suma_meta else 0 end,
    'histórico mensual uniforme por tienda_codigo'::text
  from calc c cross join sums s
  order by c.fecha;
end;
$$;

revoke all on function public.proponer_presupuesto_manual(text,date,text,numeric) from public;
grant execute on function public.proponer_presupuesto_manual(text,date,text,numeric) to authenticated;

comment on function public.proponer_presupuesto_manual(text,date,text,numeric) is
  'Propone metas con la tienda canónica exacta; usa histórico diario si existe y, si solo hay total mensual, lo distribuye uniformemente por días calendario.';

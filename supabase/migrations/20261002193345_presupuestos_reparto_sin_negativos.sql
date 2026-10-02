-- Conserva permisos existentes y totales; no modifica presupuestos aprobados.
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

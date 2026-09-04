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
  if p_metrica not in ('meta_venta_total','meta_creditos','meta_uds_cel','meta_uds_acc','meta_utilidad') then
    raise exception 'Métrica no permitida';
  end if;
  if p_pct_crecimiento < 0 or p_pct_crecimiento > 1000 then raise exception 'El crecimiento debe estar entre 0 y 1000 por ciento'; end if;

  if p_metrica = 'meta_venta_total' then
    select count(distinct v.fecha) > 1 into v_hay_diario
    from public.ventas v
    where v.tienda_codigo = p_tienda and v.fecha >= v_inicio_hist and v.fecha < v_fin_hist
      and coalesce(v.anulada, false) = false;
    if v_hay_diario then
      return query
      with dias as (
        select d::date as fecha from generate_series(v_inicio, v_fin - 1, interval '1 day') d
      ), base as (
        select extract(day from v.fecha)::integer as dia, sum(v.total)::numeric as valor
        from public.ventas v
        where v.tienda_codigo = p_tienda and v.fecha >= v_inicio_hist and v.fecha < v_fin_hist
          and coalesce(v.anulada, false) = false group by 1
      )
      select d.fecha, coalesce(b.valor,0), round(coalesce(b.valor,0) * ((100.0 + p_pct_crecimiento) / 100.0)), 'histórico diario'::text
      from dias d left join base b on b.dia = extract(day from d.fecha)::integer order by d.fecha;
      return;
    end if;
  else
    select count(distinct h.fecha) > 1 into v_hay_diario
    from public.historico_importado h
    where h.tienda_codigo = p_tienda and h.fecha >= v_inicio_hist and h.fecha < v_fin_hist;
    if v_hay_diario then
      return query
      with dias as (
        select d::date as fecha from generate_series(v_inicio, v_fin - 1, interval '1 day') d
      ), base as (
        select extract(day from h.fecha)::integer as dia,
          sum(case p_metrica
            when 'meta_creditos' then h.creditos
            when 'meta_uds_cel' then h.equipos_contado_cantidad
            when 'meta_uds_acc' then h.accesorios_cantidad
            when 'meta_utilidad' then h.utilidad
          end)::numeric as valor
        from public.historico_importado h
        where h.tienda_codigo = p_tienda and h.fecha >= v_inicio_hist and h.fecha < v_fin_hist group by 1
      )
      select d.fecha, coalesce(b.valor,0), round(coalesce(b.valor,0) * ((100.0 + p_pct_crecimiento) / 100.0)), 'histórico diario'::text
      from dias d left join base b on b.dia = extract(day from d.fecha)::integer order by d.fecha;
      return;
    end if;
  end if;

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
    and hm.mes = extract(month from v_inicio_hist)::integer
  limit 1;

  v_total := coalesce(v_total, 0);
  return query
  with dias as (
    select d::date as fecha, row_number() over (order by d)::integer as rn
    from generate_series(v_inicio, v_fin - 1, interval '1 day') d
  ), calc as (
    select d.fecha, d.rn,
      round(v_total / nullif(v_dias,0)) as base_dia,
      round((v_total * ((100.0 + p_pct_crecimiento) / 100.0)) / nullif(v_dias,0)) as meta_dia
    from dias d
  ), sums as (
    select sum(base_dia) as suma_base, sum(meta_dia) as suma_meta from calc
  )
  select c.fecha,
    c.base_dia + case when c.rn = 1 then v_total - s.suma_base else 0 end,
    c.meta_dia + case when c.rn = 1 then round(v_total * ((100.0 + p_pct_crecimiento) / 100.0)) - s.suma_meta else 0 end,
    'histórico mensual prorrateado'::text
  from calc c cross join sums s order by c.fecha;
end;
$$;

revoke all on function public.proponer_presupuesto_manual(text,date,text,numeric) from public;
grant execute on function public.proponer_presupuesto_manual(text,date,text,numeric) to authenticated;

comment on function public.proponer_presupuesto_manual(text,date,text,numeric) is
  'Calcula una propuesta sin guardarla: conserva histórico diario real o prorratea el total mensual y aplica el crecimiento elegido.';

create or replace function public.guardar_presupuesto_manual(
  p_tienda text,
  p_mes date,
  p_metrica text,
  p_pct_crecimiento numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila record;
  v_total numeric := 0;
  v_dias integer := 0;
begin
  if public.rol_actual() is distinct from 'gerencia' then
    raise exception 'Solo gerencia puede aprobar y guardar presupuestos';
  end if;

  for v_fila in
    select * from public.proponer_presupuesto_manual(p_tienda, p_mes, p_metrica, p_pct_crecimiento)
  loop
    insert into public.presupuestos (
      tienda_codigo, fecha, meta_creditos, meta_uds_cel, meta_uds_acc,
      meta_utilidad, meta_venta_total, generado_desde
    ) values (
      p_tienda, v_fila.fecha,
      case when p_metrica = 'meta_creditos' then v_fila.meta_propuesta else 0 end,
      case when p_metrica = 'meta_uds_cel' then v_fila.meta_propuesta else 0 end,
      case when p_metrica = 'meta_uds_acc' then v_fila.meta_propuesta else 0 end,
      case when p_metrica = 'meta_utilidad' then v_fila.meta_propuesta else 0 end,
      case when p_metrica = 'meta_venta_total' then v_fila.meta_propuesta else 0 end,
      'manual:' || auth.uid()::text || ':' || p_pct_crecimiento || '%'
    )
    on conflict (tienda_codigo, fecha) do update set
      meta_creditos = case when p_metrica = 'meta_creditos' then excluded.meta_creditos else presupuestos.meta_creditos end,
      meta_uds_cel = case when p_metrica = 'meta_uds_cel' then excluded.meta_uds_cel else presupuestos.meta_uds_cel end,
      meta_uds_acc = case when p_metrica = 'meta_uds_acc' then excluded.meta_uds_acc else presupuestos.meta_uds_acc end,
      meta_utilidad = case when p_metrica = 'meta_utilidad' then excluded.meta_utilidad else presupuestos.meta_utilidad end,
      meta_venta_total = case when p_metrica = 'meta_venta_total' then excluded.meta_venta_total else presupuestos.meta_venta_total end,
      generado_desde = excluded.generado_desde;
    v_total := v_total + v_fila.meta_propuesta;
    v_dias := v_dias + 1;
  end loop;

  return jsonb_build_object('ok', true, 'tienda', p_tienda, 'mes', date_trunc('month', p_mes)::date,
    'metrica', p_metrica, 'porcentaje', p_pct_crecimiento, 'dias', v_dias, 'total', v_total, 'aprobado_por', auth.uid());
end;
$$;

revoke all on function public.guardar_presupuesto_manual(text,date,text,numeric) from public;
grant execute on function public.guardar_presupuesto_manual(text,date,text,numeric) to authenticated;

comment on function public.guardar_presupuesto_manual(text,date,text,numeric) is
  'Recalcula y guarda una meta diaria solo después de aprobación explícita de Gerencia.';

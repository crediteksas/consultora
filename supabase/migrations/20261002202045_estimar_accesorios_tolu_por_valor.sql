-- Cuando el histórico de accesorios trae venta pero no unidades, estimar
-- las unidades con el precio promedio ponderado de la misma tienda y año.
-- La venta y las unidades históricas originales permanecen intactas.
create or replace function public.proponer_presupuesto_manual(
  p_tienda text, p_mes date, p_metrica text, p_pct_crecimiento numeric default 0
)
returns table(fecha date, base_anterior numeric, meta_propuesta numeric, fuente text)
language plpgsql security definer set search_path = '' as $$
declare
  v_inicio date := date_trunc('month', p_mes)::date;
  v_fin date := (date_trunc('month', p_mes) + interval '1 month')::date;
  v_inicio_hist date := (date_trunc('month', p_mes) - interval '1 year')::date;
  v_fin_hist date := (date_trunc('month', p_mes) - interval '11 months')::date;
  v_total numeric;
  v_venta_accesorios numeric;
  v_precio_promedio numeric;
  v_dias integer := extract(day from (date_trunc('month', p_mes) + interval '1 month - 1 day'))::integer;
  v_fuente text := 'histórico mensual uniforme por tienda_codigo';
begin
  if public.rol_actual() is null or not public.es_central() then
    raise exception 'Solo gerencia o auditoría pueden preparar presupuestos';
  end if;
  if p_tienda is null or p_mes is null then raise exception 'Faltan tienda o mes'; end if;
  if not exists (
    select 1 from public.origenes o
    where o.codigo = p_tienda and o.tipo = 'propia' and o.activo
  ) then raise exception 'La tienda no pertenece al catálogo Retail activo'; end if;
  if p_metrica not in ('meta_venta_total','meta_creditos','meta_uds_cel','meta_uds_acc') then
    raise exception 'Métrica no permitida';
  end if;
  if p_pct_crecimiento is null or p_pct_crecimiento < 0 or p_pct_crecimiento > 1000 then
    raise exception 'El crecimiento debe estar entre 0 y 1000 por ciento';
  end if;

  select case p_metrica
    when 'meta_venta_total' then hm.venta_total
    when 'meta_creditos' then hm.cred_uds
    when 'meta_uds_cel' then hm.cel_uds
    when 'meta_uds_acc' then hm.acc_uds
  end::numeric,
  case when p_metrica = 'meta_uds_acc' then hm.acc_venta end
  into v_total, v_venta_accesorios
  from public.historico_mensual hm
  where hm.tienda_codigo = p_tienda
    and hm.anio = extract(year from v_inicio_hist)::integer
    and hm.mes = extract(month from v_inicio_hist)::integer;

  if v_total is null then
    select sum(case p_metrica
      when 'meta_venta_total' then h.venta_total
      when 'meta_creditos' then h.creditos
      when 'meta_uds_cel' then h.equipos_contado_cantidad
      when 'meta_uds_acc' then h.accesorios_cantidad end),
      case when p_metrica = 'meta_uds_acc' then sum(h.accesorios_venta) end
    into v_total, v_venta_accesorios
    from public.historico_importado h
    where h.tienda_codigo = p_tienda and h.fecha >= v_inicio_hist and h.fecha < v_fin_hist;
    v_fuente := 'histórico importado uniforme por tienda_codigo';
  end if;
  if v_total is null and p_metrica = 'meta_venta_total' then
    select sum(v.total) into v_total from public.ventas v
    where v.tienda_codigo = p_tienda and v.fecha >= v_inicio_hist and v.fecha < v_fin_hist
      and not coalesce(v.anulada, false);
    v_fuente := 'ventas operativas uniformes por tienda_codigo';
  end if;

  if p_metrica = 'meta_uds_acc' and coalesce(v_total, 0) = 0
    and coalesce(v_venta_accesorios, 0) > 0 then
    select sum(hm.acc_venta) / nullif(sum(hm.acc_uds), 0)
    into v_precio_promedio from public.historico_mensual hm
    where hm.tienda_codigo = p_tienda
      and hm.anio = extract(year from v_inicio_hist)::integer
      and hm.mes <> extract(month from v_inicio_hist)::integer
      and hm.acc_venta > 0 and hm.acc_uds > 0;
    if v_precio_promedio is null or v_precio_promedio <= 0 then
      raise exception 'Faltan unidades de accesorios y no hay precio promedio verificable para la tienda %', p_tienda;
    end if;
    v_total := round(v_venta_accesorios / v_precio_promedio);
    v_fuente := format('estimación por valor de accesorios y precio promedio propio de %s',
      extract(year from v_inicio_hist)::integer);
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
    v_fuente
  from dias d order by d.fecha;
end;
$$;
revoke execute on function public.proponer_presupuesto_manual(text,date,text,numeric)
  from public,anon,authenticated;

-- Oscar aprobó crecimiento del 25 % para Tolú en octubre de 2026.
-- Corregir exclusivamente la meta de accesorios ya guardada en cero.
do $$
declare
  v_venta_octubre numeric;
  v_venta_referencia numeric;
  v_unidades_referencia numeric;
  v_base integer;
  v_meta integer;
  v_filas integer;
  v_ceros integer;
  v_actualizadas integer;
begin
  select hm.acc_venta into v_venta_octubre from public.historico_mensual hm
  where hm.tienda_codigo = 'CK-01' and hm.anio = 2025 and hm.mes = 10 and hm.acc_uds = 0;
  select sum(hm.acc_venta), sum(hm.acc_uds)
  into v_venta_referencia, v_unidades_referencia
  from public.historico_mensual hm
  where hm.tienda_codigo = 'CK-01' and hm.anio = 2025 and hm.mes <> 10
    and hm.acc_venta > 0 and hm.acc_uds > 0;
  if v_venta_octubre is distinct from 3366000 or v_venta_referencia is distinct from 53453000
    or v_unidades_referencia is distinct from 2698 then
    raise exception 'Cambió el histórico de Tolú; se detuvo la estimación';
  end if;
  v_base := round(v_venta_octubre / (v_venta_referencia / v_unidades_referencia));
  v_meta := round(v_base * 1.25);
  if v_base is distinct from 170 or v_meta is distinct from 213 then
    raise exception 'La estimación de Tolú no coincide con 170 unidades base y 213 de meta';
  end if;

  perform 1 from public.presupuestos p
  where p.tienda_codigo = 'CK-01' and p.fecha between date '2026-10-01' and date '2026-10-31'
  for update;
  select count(*), count(*) filter (where coalesce(p.meta_uds_acc, 0) = 0)
  into v_filas, v_ceros from public.presupuestos p
  where p.tienda_codigo = 'CK-01' and p.fecha between date '2026-10-01' and date '2026-10-31';
  if v_filas <> 31 or v_ceros <> 31 then
    raise exception 'El presupuesto de Tolú cambió; no se sobrescribió ningún valor';
  end if;

  with dias as (
    select p.id, row_number() over (order by p.fecha)::numeric as rn
    from public.presupuestos p
    where p.tienda_codigo = 'CK-01' and p.fecha between date '2026-10-01' and date '2026-10-31'
  )
  update public.presupuestos p set
    meta_uds_acc = round(v_meta * d.rn / 31) - round(v_meta * (d.rn - 1) / 31),
    generado_desde = 'estimacion_accesorios_por_valor_2025:25%'
  from dias d where p.id = d.id;
  get diagnostics v_actualizadas = row_count;
  if v_actualizadas <> 31 then raise exception 'No se actualizaron los 31 días'; end if;

  insert into public.audit_log(usuario, accion, tabla, registro_id, detalle)
  values('Gerencia Oscar Pacheco; ejecución asistida autorizada',
    'presupuesto_accesorios_estimado', 'presupuestos', 'CK-01:2026-10',
    jsonb_build_object('tienda','Celfiao Tolú','metodo','venta de octubre 2025 dividida por precio promedio ponderado de otros meses de 2025 de la misma tienda',
      'venta_octubre_2025',v_venta_octubre,'venta_referencia_2025',v_venta_referencia,
      'unidades_referencia_2025',v_unidades_referencia,'base_unidades_estimada',v_base,
      'crecimiento_porcentaje',25,'meta_unidades_octubre_2026',v_meta,
      'antes_unidades',0,'dias',v_actualizadas,'inventario_modificado',false));
end;
$$;

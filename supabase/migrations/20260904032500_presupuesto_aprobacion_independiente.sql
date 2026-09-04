create or replace function public.guardar_presupuesto_manual_general(
  p_tienda text, p_mes date,
  p_pct_ventas numeric, p_pct_creditos numeric, p_pct_celulares numeric,
  p_pct_accesorios numeric, p_pct_utilidad numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_resultados jsonb := '[]'::jsonb;
  v_item jsonb;
  v_metricas text[] := array['meta_venta_total','meta_creditos','meta_uds_cel','meta_uds_acc','meta_utilidad'];
  v_porcentajes numeric[] := array[p_pct_ventas,p_pct_creditos,p_pct_celulares,p_pct_accesorios,p_pct_utilidad];
  i integer;
begin
  if auth.uid() is null or public.rol_actual() <> 'gerencia' then
    raise exception 'Solo Gerencia puede aprobar presupuestos';
  end if;
  for i in 1..array_length(v_metricas, 1) loop
    if v_porcentajes[i] < 0 or v_porcentajes[i] > 1000 then
      raise exception 'Todos los porcentajes deben estar entre 0 y 1000';
    end if;
    v_item := public.guardar_presupuesto_manual(p_tienda, p_mes, v_metricas[i], v_porcentajes[i]);
    v_resultados := v_resultados || jsonb_build_array(v_item);
  end loop;
  return jsonb_build_object('tienda', p_tienda, 'mes', date_trunc('month', p_mes)::date,
    'indicadores', v_resultados, 'aprobado_por', auth.uid());
end;
$$;

revoke all on function public.guardar_presupuesto_manual_general(text,date,numeric,numeric,numeric,numeric,numeric) from public;
grant execute on function public.guardar_presupuesto_manual_general(text,date,numeric,numeric,numeric,numeric,numeric) to authenticated;

comment on function public.guardar_presupuesto_manual_general(text,date,numeric,numeric,numeric,numeric,numeric) is
  'Aprueba atómicamente los cinco indicadores de una tienda, cada uno con su porcentaje independiente.';

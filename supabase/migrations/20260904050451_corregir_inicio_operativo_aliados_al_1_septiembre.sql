-- Corrección puntual autorizada por Gerencia: seis operaciones del 1 de
-- septiembre de 2026 pertenecen a la operación vigente de Aliados.
do $$
declare
  v_desde constant timestamptz := timestamptz '2026-09-01 00:00:00-05';
  v_hasta constant timestamptz := timestamptz '2026-09-02 00:00:00-05';
  v_operaciones integer;
  v_creditos integer;
  v_utilidad numeric(16,2);
begin
  select count(*), coalesce(round(sum(utilidad_creditek), 2), 0)
    into v_operaciones, v_utilidad
    from public.liquidation_operations
   where operation_at >= v_desde and operation_at < v_hasta;

  if v_operaciones <> 6 or v_utilidad <> 1074800 then
    raise exception 'Validación previa falló: se esperaban 6 operaciones y $1.074.800, se encontraron % y %', v_operaciones, v_utilidad;
  end if;

  update public.liquidation_operations
     set resultado_cerrado = 0,
         cierre_utilidad_at = null,
         cierre_utilidad_motivo = null
   where operation_at >= v_desde and operation_at < v_hasta;

  update public.creditos_historicos_plataforma
     set resultado_cerrado_historico = 0,
         cierre_utilidad_at = null,
         cierre_utilidad_motivo = null,
         historico_inicial = false,
         pagado_antes_inicio = false,
         requiere_soporte = true,
         fecha_inicio_operacion = date '2026-09-01',
         datos_origen = coalesce(datos_origen, '{}'::jsonb) || jsonb_build_object(
           'clasificacion_kora', 'operacion_nueva',
           'requiere_foto_soporte', true,
           'fecha_inicio_operacion', '2026-09-01',
           'correccion_autorizada_por', 'Gerencia'
         ),
         actualizado_at = now()
   where fecha_credito >= v_desde and fecha_credito < v_hasta;

  get diagnostics v_creditos = row_count;
  if v_creditos <> 6 then
    raise exception 'Validación de cartera falló: se esperaban 6 créditos y se actualizaron %', v_creditos;
  end if;

  if exists (
    select 1 from public.liquidation_operations
     where operation_at >= v_desde and operation_at < v_hasta
       and coalesce(resultado_cerrado, 0) <> 0
  ) then
    raise exception 'La utilidad del 1 de septiembre continuó cerrada';
  end if;
end $$;

-- Precisión del total en el libro Retail; no altera costos ni aprueba traslados.
-- CREATE OR REPLACE conserva los permisos existentes.
create or replace function public.aprobar_traslado_recepcion(p_traslado_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_traslado public.traslados%rowtype;
  v_item public.traslado_items%rowtype;
  v_unidad public.unidades%rowtype;
  v_total numeric := 0;
  v_cuenta_origen uuid;
  v_cuenta_destino uuid;
  v_legacy_origen numeric := 0;
  v_diferencia numeric;
begin
  if not public.es_central() then
    raise exception 'Solo Gerencia o Auditoría puede dar el visto bueno final';
  end if;

  select * into v_traslado
  from public.traslados
  where id = p_traslado_id
  for update;

  if not found then
    raise exception 'Traslado no encontrado';
  end if;
  if v_traslado.estado <> 'recibido_pendiente_aprobacion' then
    raise exception
      'El traslado debe estar recibido y pendiente de visto bueno (estado actual: %)',
      v_traslado.estado;
  end if;
  if exists (
    select 1 from public.traslado_items ti
    where ti.traslado_id = p_traslado_id
      and coalesce(ti.precio_tienda, 0) <= 0
  ) then
    raise exception 'El traslado tiene artículos sin costo de remisión';
  end if;

  for v_item in
    select * from public.traslado_items
    where traslado_id = p_traslado_id
    order by id
  loop
    if v_item.unidad_id is not null then
      select * into v_unidad
      from public.unidades
      where id = v_item.unidad_id
      for update;

      if not found
        or v_unidad.tienda_actual is distinct from v_traslado.tienda_origen
        or v_unidad.estado is distinct from 'en_traslado'
      then
        raise exception 'El IMEI del traslado no conserva su estado y tienda de origen';
      end if;
      if v_unidad.precio_tienda is distinct from v_item.precio_tienda then
        raise exception 'El costo de remisión del IMEI cambió después del despacho';
      end if;

      update public.unidades
      set estado = 'disponible',
          tienda_actual = v_traslado.tienda_destino
      where id = v_item.unidad_id;

      insert into public.movimientos (
        tipo, tienda_codigo, producto_id, unidad_id, cantidad,
        costo, precio, referencia_tipo, referencia_id, usuario
      ) values (
        'traslado_entrada', v_traslado.tienda_destino, v_item.producto_id,
        v_item.unidad_id, 1, v_item.costo, v_item.precio_tienda,
        'traslado', p_traslado_id::text, auth.uid()
      );
    else
      perform public.aplicar_costo_promedio_tienda(
        v_traslado.tienda_destino,
        v_item.producto_id,
        v_item.cantidad,
        v_item.costo,
        v_item.precio_tienda,
        'cantidad',
        'traslado',
        p_traslado_id::text
      );

      insert into public.movimientos (
        tipo, tienda_codigo, producto_id, cantidad,
        costo, precio, referencia_tipo, referencia_id, usuario
      ) values (
        'traslado_entrada', v_traslado.tienda_destino, v_item.producto_id,
        v_item.cantidad, v_item.costo, v_item.precio_tienda,
        'traslado', p_traslado_id::text, auth.uid()
      );
    end if;

    v_total := v_total + (v_item.precio_tienda * v_item.cantidad);
  end loop;

  -- Normalizar una sola vez a la precisión del libro oficial de cartera.
  v_total := round(v_total, 0);

  if v_total <= 0 then
    raise exception 'El traslado no tiene un costo de remisión válido';
  end if;

  insert into public.cuentas_cartera (tipo_cuenta, tienda_codigo, nombre)
  select 'tienda', o.codigo, 'Cuenta tienda · ' || o.nombre
  from public.origenes o
  where o.codigo in (v_traslado.tienda_origen, v_traslado.tienda_destino)
  on conflict (tienda_codigo, tipo_cuenta)
  where tienda_codigo is not null
  do update set activo = true, updated_at = now();

  select id into v_cuenta_origen
  from public.cuentas_cartera
  where tipo_cuenta = 'tienda'
    and tienda_codigo = v_traslado.tienda_origen
    and activo = true
  for update;

  select id into v_cuenta_destino
  from public.cuentas_cartera
  where tipo_cuenta = 'tienda'
    and tienda_codigo = v_traslado.tienda_destino
    and activo = true
  for update;

  if v_cuenta_origen is null or v_cuenta_destino is null then
    raise exception 'No fue posible preparar las cuentas del traslado';
  end if;

  insert into public.movimientos_cartera (
    cuenta_id, tienda_codigo, efecto, monto, concepto,
    referencia_tipo, referencia_id, metadatos
  ) values (
    v_cuenta_origen, v_traslado.tienda_origen, 'credito', v_total,
    'Traslado aprobado', 'traslado', p_traslado_id::text,
    jsonb_build_object(
      'tienda_destino', v_traslado.tienda_destino,
      'consecutivo', v_traslado.consecutivo,
      'aprobado_por', auth.uid()
    )
  ) on conflict (cuenta_id, referencia_tipo, referencia_id, efecto) do nothing;

  insert into public.movimientos_cartera (
    cuenta_id, tienda_codigo, efecto, monto, concepto,
    referencia_tipo, referencia_id, metadatos
  ) values (
    v_cuenta_destino, v_traslado.tienda_destino, 'debito', v_total,
    'Traslado aprobado', 'traslado', p_traslado_id::text,
    jsonb_build_object(
      'tienda_origen', v_traslado.tienda_origen,
      'consecutivo', v_traslado.consecutivo,
      'aprobado_por', auth.uid()
    )
  ) on conflict (cuenta_id, referencia_tipo, referencia_id, efecto) do nothing;

  -- Compatibilidad con el libro oficial de Retail. Para traslados nuevos el
  -- valor previo es cero; el cálculo evita duplicar históricos heredados.
  select coalesce(sum(
    case cc.tipo when 'abono' then cc.monto else -cc.monto end
  ), 0)
  into v_legacy_origen
  from public.cuenta_corriente cc
  where cc.tienda_codigo = v_traslado.tienda_origen
    and cc.referencia_id = p_traslado_id::text
    and cc.referencia_tipo in ('traslado', 'traslado_ajuste_recepcion');

  v_diferencia := round(v_total - v_legacy_origen, 0);
  if v_diferencia > 0 then
    insert into public.cuenta_corriente (
      tienda_codigo, tipo, concepto, monto,
      referencia_tipo, referencia_id, usuario
    ) values (
      v_traslado.tienda_origen, 'abono',
      'Traslado #' || v_traslado.consecutivo || ' aprobado hacia '
        || v_traslado.tienda_destino,
      v_diferencia,
      case when v_legacy_origen = 0 then 'traslado' else 'traslado_ajuste_recepcion' end,
      p_traslado_id::text,
      auth.uid()
    );
  elsif v_diferencia < 0 then
    insert into public.cuenta_corriente (
      tienda_codigo, tipo, concepto, monto,
      referencia_tipo, referencia_id, usuario
    ) values (
      v_traslado.tienda_origen, 'cargo',
      'Ajuste valor de remisión traslado #' || v_traslado.consecutivo,
      abs(v_diferencia), 'traslado_ajuste_recepcion',
      p_traslado_id::text, auth.uid()
    );
  end if;

  if not exists (
    select 1 from public.cuenta_corriente cc
    where cc.tienda_codigo = v_traslado.tienda_destino
      and cc.tipo = 'cargo'
      and cc.referencia_tipo = 'traslado'
      and cc.referencia_id = p_traslado_id::text
  ) then
    insert into public.cuenta_corriente (
      tienda_codigo, tipo, concepto, monto,
      referencia_tipo, referencia_id, usuario
    ) values (
      v_traslado.tienda_destino, 'cargo',
      'Traslado #' || v_traslado.consecutivo || ' aprobado desde '
        || v_traslado.tienda_origen,
      v_total, 'traslado', p_traslado_id::text, auth.uid()
    );
  end if;

  update public.traslados
  set estado = 'cerrado',
      aprobado_at = now(),
      aprobado_por = auth.uid()
  where id = p_traslado_id;

  return jsonb_build_object(
    'ok', true,
    'consecutivo', v_traslado.consecutivo,
    'total', v_total,
    'efecto_neto', 0,
    'estado', 'cerrado'
  );
end;
$function$;

-- Los traslados entre tiendas se cierran en tres pasos:
-- 1. La tienda origen despacha y el inventario queda bloqueado.
-- 2. La tienda destino confirma la recepción física.
-- 3. Gerencia/Auditoría valida IMEIs y costos de remisión, mueve el
--    inventario y registra el abono/cargo de cartera en una sola transacción.

alter table public.traslados
  add column if not exists aprobado_por uuid references public.perfiles(id),
  add column if not exists aprobado_at timestamptz;

alter table public.traslados drop constraint if exists traslados_estado_check;
alter table public.traslados
  add constraint traslados_estado_check
  check (estado in (
    'despachado',
    'recibido_pendiente_aprobacion',
    'recibido', -- histórico: ya tuvo efecto antes de este flujo
    'cerrado',
    'anulado'
  ));

create index if not exists traslados_pendientes_visto_bueno_idx
  on public.traslados (recibido_at desc)
  where estado = 'recibido_pendiente_aprobacion';

comment on column public.traslados.aprobado_por is
  'Usuario central que validó IMEIs, costo de remisión y cierre contable.';
comment on column public.traslados.aprobado_at is
  'Momento en que Gerencia/Auditoría cerró el traslado.';

create or replace function public.ejecutar_traslado_recepcion(p_traslado_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_traslado public.traslados%rowtype;
  v_total numeric := 0;
begin
  if public.rol_actual() is distinct from 'admin_tienda' then
    raise exception 'Solo el administrador de la tienda destino puede confirmar la recepción';
  end if;

  select * into v_traslado
  from public.traslados
  where id = p_traslado_id
  for update;

  if not found then
    raise exception 'Traslado no encontrado';
  end if;
  if v_traslado.estado <> 'despachado' then
    raise exception
      'El traslado debe estar despachado para poder recibirse (estado actual: %)',
      v_traslado.estado;
  end if;
  if public.tienda_actual() is distinct from v_traslado.tienda_destino then
    raise exception 'No autorizado: este traslado no es para tu tienda';
  end if;
  if not exists (
    select 1 from public.traslado_items ti
    where ti.traslado_id = p_traslado_id
  ) then
    raise exception 'El traslado no tiene productos';
  end if;
  if exists (
    select 1 from public.traslado_items ti
    where ti.traslado_id = p_traslado_id
      and coalesce(ti.precio_tienda, 0) <= 0
  ) then
    raise exception 'El traslado tiene artículos sin costo de remisión';
  end if;
  if exists (
    select 1
    from public.traslado_items ti
    left join public.unidades u on u.id = ti.unidad_id
    where ti.traslado_id = p_traslado_id
      and ti.unidad_id is not null
      and (
        u.id is null
        or u.tienda_actual is distinct from v_traslado.tienda_origen
        or u.estado is distinct from 'en_traslado'
        or u.precio_tienda is distinct from ti.precio_tienda
      )
  ) then
    raise exception 'Los IMEIs o sus costos no coinciden con el despacho; solicita revisión central';
  end if;

  select coalesce(sum(ti.precio_tienda * ti.cantidad), 0)
  into v_total
  from public.traslado_items ti
  where ti.traslado_id = p_traslado_id;

  update public.traslados
  set estado = 'recibido_pendiente_aprobacion',
      recibido_at = now(),
      recibido_por = auth.uid()
  where id = p_traslado_id;

  return jsonb_build_object(
    'ok', true,
    'consecutivo', v_traslado.consecutivo,
    'total', v_total,
    'estado', 'recibido_pendiente_aprobacion'
  );
end;
$function$;

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

  v_diferencia := v_total - v_legacy_origen;
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

create or replace function public.anular_traslado(
  p_traslado_id uuid,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_traslado public.traslados%rowtype;
  v_item public.traslado_items%rowtype;
  v_mov_original public.movimientos%rowtype;
begin
  if not public.es_central() then
    raise exception 'Solo Gerencia/Auditoría puede anular un traslado';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'El motivo de anulación es obligatorio';
  end if;

  select * into v_traslado
  from public.traslados
  where id = p_traslado_id
  for update;

  if not found then
    raise exception 'Traslado no encontrado';
  end if;
  if v_traslado.estado not in ('despachado', 'recibido_pendiente_aprobacion') then
    raise exception
      'Solo se puede anular antes del visto bueno final (estado actual: %)',
      v_traslado.estado;
  end if;

  for v_item in
    select * from public.traslado_items
    where traslado_id = p_traslado_id
  loop
    if v_item.unidad_id is not null then
      update public.unidades
      set estado = 'disponible',
          tienda_actual = v_traslado.tienda_origen
      where id = v_item.unidad_id
        and estado = 'en_traslado';
      if not found then
        raise exception 'No se pudo devolver un IMEI a la tienda origen';
      end if;
    else
      update public.stock_cantidad
      set cantidad = cantidad + v_item.cantidad,
          updated_at = now()
      where producto_id = v_item.producto_id
        and tienda_codigo = v_traslado.tienda_origen;
      if not found then
        raise exception 'No se pudo devolver el producto a la tienda origen';
      end if;
    end if;

    select m.* into v_mov_original
    from public.movimientos m
    where m.referencia_tipo = 'traslado'
      and m.referencia_id = p_traslado_id::text
      and m.tipo = 'traslado_salida'
      and m.producto_id = v_item.producto_id
      and coalesce(m.unidad_id::text, '') = coalesce(v_item.unidad_id::text, '')
    order by m.id
    limit 1;

    insert into public.movimientos (
      tipo, tienda_codigo, producto_id, unidad_id, cantidad,
      costo, precio, referencia_tipo, referencia_id, reverso_de,
      usuario, nota
    ) values (
      'reverso', v_traslado.tienda_origen, v_item.producto_id,
      v_item.unidad_id, v_item.cantidad, v_item.costo,
      v_item.precio_tienda, 'traslado', p_traslado_id::text,
      v_mov_original.id, auth.uid(), p_motivo
    );
  end loop;

  -- Antes del visto bueno no existe movimiento de cartera que reversar.
  update public.traslados
  set estado = 'anulado',
      nota = concat_ws(' | ', nullif(nota, ''), 'Anulado: ' || btrim(p_motivo))
  where id = p_traslado_id;

  return jsonb_build_object('ok', true, 'consecutivo', v_traslado.consecutivo);
end;
$function$;

revoke all on function public.ejecutar_traslado_recepcion(uuid) from public, anon;
revoke all on function public.aprobar_traslado_recepcion(uuid) from public, anon;
revoke all on function public.anular_traslado(uuid, text) from public, anon;
grant execute on function public.ejecutar_traslado_recepcion(uuid) to authenticated;
grant execute on function public.aprobar_traslado_recepcion(uuid) to authenticated;
grant execute on function public.anular_traslado(uuid, text) to authenticated;

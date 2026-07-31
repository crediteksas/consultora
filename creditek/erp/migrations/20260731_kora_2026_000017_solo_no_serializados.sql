begin;

-- Regla definitiva KORA-2026-000017: solo inventario por cantidad se pondera.
-- La firma se conserva para no romper llamadas existentes, pero el helper
-- verifica también el tipo canónico del producto antes de modificar stock.
create or replace function public.aplicar_costo_promedio_tienda(
  p_tienda_codigo text,
  p_producto_id uuid,
  p_cantidad_entrada integer,
  p_costo_interno_entrada numeric,
  p_costo_tienda_entrada numeric,
  p_tipo_inventario text,
  p_origen_tipo text,
  p_origen_id text,
  p_unidad_id uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existencias_anteriores integer := 0;
  v_costo_anterior numeric := 0;
  v_costo_interno_anterior numeric := 0;
  v_costo_nuevo numeric;
  v_costo_interno_nuevo numeric;
  v_stock public.stock_cantidad%rowtype;
  v_tipo_producto text;
begin
  select p.tipo into v_tipo_producto
  from public.productos p
  where p.id = p_producto_id;

  if v_tipo_producto is null then
    raise exception 'Producto no encontrado para calcular costo promedio';
  end if;
  if p_tipo_inventario <> 'cantidad' or v_tipo_producto <> 'cantidad' then
    raise exception 'El costo promedio solo aplica a productos no serializados';
  end if;
  if p_cantidad_entrada <= 0
     or p_costo_tienda_entrada is null
     or p_costo_tienda_entrada < 0
     or p_costo_interno_entrada is null
     or p_costo_interno_entrada < 0 then
    raise exception 'Entrada inválida para calcular costo promedio';
  end if;
  if p_origen_tipo not in ('remision', 'traslado') then
    raise exception 'Origen de inventario inválido';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_tienda_codigo || ':' || p_producto_id::text, 0)
  );

  select * into v_stock
  from public.stock_cantidad
  where tienda_codigo = p_tienda_codigo
    and producto_id = p_producto_id
  for update;

  if found then
    v_existencias_anteriores := v_stock.cantidad;
    v_costo_anterior := coalesce(v_stock.precio_tienda, 0);
    v_costo_interno_anterior := coalesce(v_stock.costo_promedio, 0);
  end if;

  v_costo_nuevo := case
    when v_existencias_anteriores = 0 then p_costo_tienda_entrada
    else ((v_existencias_anteriores * v_costo_anterior)
      + (p_cantidad_entrada * p_costo_tienda_entrada))
      / (v_existencias_anteriores + p_cantidad_entrada)
  end;
  v_costo_interno_nuevo := case
    when v_existencias_anteriores = 0 then p_costo_interno_entrada
    else ((v_existencias_anteriores * v_costo_interno_anterior)
      + (p_cantidad_entrada * p_costo_interno_entrada))
      / (v_existencias_anteriores + p_cantidad_entrada)
  end;

  insert into public.stock_cantidad (
    producto_id, tienda_codigo, cantidad, costo_promedio, precio_tienda
  ) values (
    p_producto_id, p_tienda_codigo, p_cantidad_entrada,
    v_costo_interno_nuevo, v_costo_nuevo
  )
  on conflict (producto_id, tienda_codigo) do update set
    cantidad = public.stock_cantidad.cantidad + p_cantidad_entrada,
    costo_promedio = v_costo_interno_nuevo,
    precio_tienda = v_costo_nuevo,
    updated_at = now();

  insert into public.costo_promedio_tienda_historial (
    tienda_codigo, producto_id, tipo_inventario,
    existencias_anteriores, unidades_entrada, existencias_nuevas,
    costo_anterior, costo_entrada, costo_nuevo,
    origen_tipo, origen_id, usuario_id
  ) values (
    p_tienda_codigo, p_producto_id, 'cantidad',
    v_existencias_anteriores, p_cantidad_entrada,
    v_existencias_anteriores + p_cantidad_entrada,
    v_costo_anterior, p_costo_tienda_entrada, v_costo_nuevo,
    p_origen_tipo, p_origen_id, auth.uid()
  );

  return v_costo_nuevo;
end;
$$;

do $$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(
    'public.confirmar_recepcion_remision(uuid,jsonb)'::regprocedure
  ) into v_definition;

  v_updated := replace(v_definition, $old$
        PERFORM public.aplicar_costo_promedio_tienda(
          v_remision.tienda_codigo, v_item.producto_id, 1,
          v_item.precio_remision, v_item.precio_remision,
          'serializado', 'remision', v_remision.id::text, v_unidad_id
        );

        UPDATE unidades
        SET imei = v_imei_norm,
            estado = 'disponible',
            tienda_actual = v_remision.tienda_codigo
        WHERE id = v_unidad_id;
$old$, $new$
        UPDATE unidades
        SET imei = v_imei_norm,
            estado = 'disponible',
            tienda_actual = v_remision.tienda_codigo
        WHERE id = v_unidad_id;
$new$);

  if v_updated = v_definition then
    raise exception 'No se encontró el promedio serializado en confirmar_recepcion_remision';
  end if;
  execute v_updated;
end;
$$;

do $$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(
    'public.ejecutar_traslado_recepcion(uuid)'::regprocedure
  ) into v_definition;

  v_updated := replace(v_definition, $old$
      perform public.aplicar_costo_promedio_tienda(
        v_traslado.tienda_destino, v_item.producto_id, 1,
        v_item.costo, v_item.precio_tienda,
        'serializado', 'traslado', p_traslado_id::text, v_item.unidad_id
      );

      update public.unidades
      set estado = 'disponible',
          tienda_actual = v_traslado.tienda_destino
      where id = v_item.unidad_id;
$old$, $new$
      update public.unidades
      set estado = 'disponible',
          tienda_actual = v_traslado.tienda_destino
      where id = v_item.unidad_id;
$new$);

  if v_updated = v_definition then
    raise exception 'No se encontró el promedio serializado en ejecutar_traslado_recepcion';
  end if;
  execute v_updated;
end;
$$;

commit;

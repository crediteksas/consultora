CREATE OR REPLACE FUNCTION public.registrar_venta(p_tienda_codigo text, p_tipo text, p_cliente_id uuid, p_items jsonb, p_credito jsonb, p_nota text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rol text;
  v_venta_id uuid;
  v_consecutivo bigint;
  v_total numeric := 0;
  v_item jsonb;
  v_producto record;
  v_unidad record;
  v_stock record;
  v_costo numeric;
  v_cantidad int;
  v_precio numeric;
begin
  v_rol := rol_actual();
  if v_rol is null then
    raise exception 'Tu usuario no tiene un perfil asignado. Contacta al administrador.';
  end if;
  if not (es_central() or tienda_actual() = p_tienda_codigo) then
    raise exception 'No autorizado para vender en esta tienda';
  end if;
  if p_tipo not in ('contado','credito') then
    raise exception 'Tipo de venta inválido';
  end if;
  if p_tipo = 'credito' and p_cliente_id is null then
    raise exception 'La venta a crédito requiere cliente';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta debe tener al menos un producto';
  end if;

  insert into ventas (tienda_codigo, vendedor, tipo, cliente_id, total, anulada, nota)
  values (p_tienda_codigo, auth.uid(), p_tipo, p_cliente_id, 0, false, p_nota)
  returning id, consecutivo into v_venta_id, v_consecutivo;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_producto from productos where id = (v_item->>'producto_id')::uuid;
    if not found then raise exception 'Producto no encontrado'; end if;

    v_cantidad := coalesce((v_item->>'cantidad')::int, 1);
    v_precio := (v_item->>'precio_venta')::numeric;
    if v_precio is null or v_precio <= 0 then
      raise exception 'Precio de venta inválido para "%"', v_producto.nombre;
    end if;

    if v_producto.tipo = 'serializado' then
      if v_item->>'unidad_id' is null then
        raise exception 'Falta el IMEI para "%"', v_producto.nombre;
      end if;
      select * into v_unidad from unidades where id = (v_item->>'unidad_id')::uuid for update;
      if not found then
        raise exception 'IMEI no registrado en inventario';
      end if;
      if v_unidad.producto_id <> v_producto.id then
        raise exception 'El IMEI ingresado no corresponde al producto "%"', v_producto.nombre;
      end if;
      if v_unidad.tienda_actual is distinct from p_tienda_codigo then
        raise exception 'Este equipo está en otra tienda (%)', coalesce(v_unidad.tienda_actual, 'sin asignar');
      end if;
      if v_unidad.estado <> 'disponible' then
        raise exception 'Este equipo ya no está disponible (estado: %)', v_unidad.estado;
      end if;

      v_costo := v_unidad.costo_remision;
      if v_costo is null or v_costo < 0 then
        raise exception 'El equipo "%" no tiene costo real trazable', v_producto.nombre;
      end if;

      insert into venta_items (venta_id, producto_id, unidad_id, cantidad, precio_venta, costo_congelado)
      values (v_venta_id, v_producto.id, v_unidad.id, 1, v_precio, v_costo);

      update unidades set estado = 'vendido' where id = v_unidad.id;

      insert into movimientos (tipo, tienda_codigo, producto_id, unidad_id, cantidad, costo, precio, referencia_tipo, referencia_id, usuario)
      values ('venta', p_tienda_codigo, v_producto.id, v_unidad.id, 1, v_costo, v_precio, 'venta', v_venta_id::text, auth.uid());

      v_total := v_total + v_precio;
    else
      select * into v_stock from stock_cantidad where producto_id = v_producto.id and tienda_codigo = p_tienda_codigo for update;
      if not found or v_stock.cantidad < v_cantidad then
        raise exception 'Stock insuficiente para "%": disponible %, solicitado %', v_producto.nombre, coalesce(v_stock.cantidad, 0), v_cantidad;
      end if;

      v_costo := v_stock.costo_promedio;
      if v_costo is null or v_costo < 0 then
        raise exception 'El producto "%" no tiene costo real trazable', v_producto.nombre;
      end if;

      insert into venta_items (venta_id, producto_id, unidad_id, cantidad, precio_venta, costo_congelado)
      values (v_venta_id, v_producto.id, null, v_cantidad, v_precio, v_costo);

      update stock_cantidad set cantidad = cantidad - v_cantidad, updated_at = now()
      where producto_id = v_producto.id and tienda_codigo = p_tienda_codigo;

      insert into movimientos (tipo, tienda_codigo, producto_id, cantidad, costo, precio, referencia_tipo, referencia_id, usuario)
      values ('venta', p_tienda_codigo, v_producto.id, v_cantidad, v_costo, v_precio, 'venta', v_venta_id::text, auth.uid());

      v_total := v_total + (v_precio * v_cantidad);
    end if;
  end loop;

  update ventas set total = v_total where id = v_venta_id;

  if p_tipo = 'credito' then
    if p_credito is null then
      raise exception 'Faltan los datos del crédito';
    end if;
    insert into creditos (venta_id, financiera, cuota_inicial, valor_esperado_financiera, plazo_meses, estado_conciliacion)
    values (
      v_venta_id,
      p_credito->>'financiera',
      coalesce((p_credito->>'cuota_inicial')::numeric, 0),
      (p_credito->>'valor_esperado')::numeric,
      (p_credito->>'plazo_meses')::int,
      'pendiente'
    );
  end if;

  return jsonb_build_object('ok', true, 'venta_id', v_venta_id, 'consecutivo', v_consecutivo, 'total', v_total);
end;
$function$


CREATE OR REPLACE FUNCTION public.obtener_detalle_factura_proveedor(p_factura_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_factura jsonb;
  v_lineas jsonb;
  v_pagos jsonb;
begin
  if not coalesce(public.es_central(), false) then
    raise exception 'Solo gerencia o auditoría pueden consultar compras';
  end if;

  select jsonb_build_object(
    'id', fp.id,
    'proveedor_id', fp.proveedor_id,
    'proveedor_nombre', p.nombre,
    'numero', fp.numero,
    'fecha', fp.fecha,
    'total', fp.total,
    'saldo', fp.saldo,
    'soporte_path', fp.soporte_path,
    'nota', fp.nota,
    'created_at', fp.created_at
  )
  into v_factura
  from public.facturas_proveedor fp
  join public.proveedores p on p.id = fp.proveedor_id
  where fp.id = p_factura_id;

  if v_factura is null then
    raise exception 'Factura de proveedor no encontrada';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'movimiento_id', m.id,
        'producto_id', m.producto_id,
        'producto_nombre', p.nombre,
        'cantidad', m.cantidad,
        'costo_unitario', m.costo,
        'precio_tienda', m.precio,
        'subtotal', m.cantidad * m.costo
      )
      order by m.id
    ),
    '[]'::jsonb
  )
  into v_lineas
  from public.movimientos m
  join public.productos p on p.id = m.producto_id
  where m.referencia_tipo = 'factura_proveedor'
    and m.referencia_id = p_factura_id::text
    and m.tipo = 'compra_entrada'
    and not exists (
      select 1 from public.movimientos r
      where r.reverso_de = m.id and r.tipo = 'reverso'
        and r.producto_id = m.producto_id
        and r.tienda_codigo = m.tienda_codigo
        and r.referencia_tipo = m.referencia_tipo
        and r.referencia_id = m.referencia_id
        and r.cantidad = -m.cantidad
        and r.costo is not distinct from m.costo
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pp.id,
        'monto', pp.monto,
        'fecha', pp.fecha,
        'metodo', pp.metodo,
        'referencia', pp.referencia,
        'nota', pp.nota,
        'soporte_path', pp.soporte_path,
        'registrado_por', pp.registrado_por,
        'created_at', pp.created_at
      )
      order by pp.fecha, pp.created_at
    ),
    '[]'::jsonb
  )
  into v_pagos
  from public.pagos_proveedor pp
  where pp.factura_id = p_factura_id;

  return jsonb_build_object(
    'ok', true,
    'factura', v_factura,
    'lineas', v_lineas,
    'pagos', v_pagos
  );
end;
$function$

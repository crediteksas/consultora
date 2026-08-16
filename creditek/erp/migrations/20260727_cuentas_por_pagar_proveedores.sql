-- Cuentas por pagar a proveedores: detalle auditable y pagos idempotentes.
-- Requiere las tablas base facturas_proveedor, pagos_proveedor, movimientos y productos.

begin;

do $$
begin
  if to_regclass('public.facturas_proveedor') is null
     or to_regclass('public.pagos_proveedor') is null then
    raise exception 'Faltan las tablas base de cuentas por pagar a proveedores';
  end if;
end;
$$;

alter table public.pagos_proveedor
  add column if not exists idempotency_key uuid,
  add column if not exists metodo text,
  add column if not exists referencia text,
  add column if not exists nota text;

create unique index if not exists pagos_proveedor_idempotency_key_uidx
  on public.pagos_proveedor (idempotency_key)
  where idempotency_key is not null;

create or replace function public.obtener_detalle_factura_proveedor(
  p_factura_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
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
    and m.tipo = 'compra_entrada';

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
$$;

create or replace function public.registrar_pago_proveedor(
  p_factura_id uuid,
  p_monto numeric,
  p_fecha date,
  p_metodo text default null,
  p_referencia text default null,
  p_soporte_path text default null,
  p_nota text default null,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_factura public.facturas_proveedor%rowtype;
  v_pago public.pagos_proveedor%rowtype;
begin
  if not coalesce(public.es_central(), false) then
    raise exception 'Solo gerencia o auditoría pueden registrar pagos';
  end if;
  if p_idempotency_key is null then
    raise exception 'La llave de idempotencia es requerida';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El pago debe ser mayor que cero';
  end if;
  if p_fecha is null then
    raise exception 'La fecha del pago es requerida';
  end if;

  select *
  into v_factura
  from public.facturas_proveedor
  where id = p_factura_id
  for update;

  if not found then
    raise exception 'Factura de proveedor no encontrada';
  end if;

  select *
  into v_pago
  from public.pagos_proveedor
  where idempotency_key = p_idempotency_key;

  if found then
    if v_pago.factura_id <> p_factura_id or v_pago.monto <> p_monto then
      raise exception 'La llave de idempotencia ya fue usada con otro pago';
    end if;
    return jsonb_build_object(
      'ok', true,
      'reutilizado', true,
      'pago_id', v_pago.id,
      'saldo', v_factura.saldo
    );
  end if;

  if p_monto > v_factura.saldo then
    raise exception 'El pago supera el saldo pendiente';
  end if;

  insert into public.pagos_proveedor (
    factura_id,
    proveedor_id,
    monto,
    fecha,
    metodo,
    referencia,
    soporte_path,
    nota,
    registrado_por,
    idempotency_key
  )
  values (
    p_factura_id,
    v_factura.proveedor_id,
    p_monto,
    p_fecha,
    nullif(trim(p_metodo), ''),
    nullif(trim(p_referencia), ''),
    nullif(trim(p_soporte_path), ''),
    nullif(trim(p_nota), ''),
    auth.uid(),
    p_idempotency_key
  )
  returning * into v_pago;

  update public.facturas_proveedor
  set saldo = saldo - p_monto
  where id = p_factura_id
  returning * into v_factura;

  return jsonb_build_object(
    'ok', true,
    'reutilizado', false,
    'pago_id', v_pago.id,
    'saldo', v_factura.saldo
  );
end;
$$;

revoke all on function public.obtener_detalle_factura_proveedor(uuid)
  from public, anon;
grant execute on function public.obtener_detalle_factura_proveedor(uuid)
  to authenticated;

revoke all on function public.registrar_pago_proveedor(
  uuid, numeric, date, text, text, text, text, uuid
) from public, anon;
grant execute on function public.registrar_pago_proveedor(
  uuid, numeric, date, text, text, text, text, uuid
) to authenticated;

commit;

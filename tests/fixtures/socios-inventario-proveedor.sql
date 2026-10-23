-- Función de pago de proveedor contrastada en producción. Solo código, sin registros reales.
CREATE OR REPLACE FUNCTION proveedores_control_private.registrar_pago_proveedor(p_factura_id uuid, p_monto numeric, p_fecha date, p_metodo text DEFAULT NULL::text, p_referencia text DEFAULT NULL::text, p_soporte_path text DEFAULT NULL::text, p_nota text DEFAULT NULL::text, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_factura public.facturas_proveedor%rowtype;
  v_pago public.pagos_proveedor%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo and p.rol in ('gerencia','auditoria')) then
    raise exception 'Solo gerencia o auditoría pueden registrar pagos';
  end if;
  if p_idempotency_key is null then
    raise exception 'La llave de idempotencia es requerida';
  end if;
  if p_monto is null or not(p_monto > 0 and p_monto < 1000000000000000) then
    raise exception 'El pago debe ser mayor que cero';
  end if;
  if p_fecha is null then
    raise exception 'La fecha del pago es requerida';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pago-proveedor:'||p_idempotency_key::text,0));
  perform 1 from public.proveedores where id=(select proveedor_id from public.facturas_proveedor where id=p_factura_id) and activo for update;
  if not found then raise exception 'Proveedor no activo o factura no encontrada'; end if;
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

  -- El saldo negativo conserva el pago excedente completo.
  if p_monto > greatest(v_factura.saldo,0) and
    (nullif(btrim(coalesce(p_referencia,'')),'') is null or length(btrim(coalesce(p_nota,'')))<8)
  then raise exception 'Para registrar un excedente indica referencia y motivo del saldo a favor'; end if;

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
$function$

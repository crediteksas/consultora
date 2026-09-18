begin;

do $$
declare
  v_actor uuid;
  v_updated integer;
begin
  if exists (
    select 1
    from public.audit_log
    where accion = 'corregir_imeis_remision_28_chinu'
      and registro_id = 'remision-28-chinu'
  ) then
    return;
  end if;

  select id into v_actor
  from public.perfiles
  where activo = true
    and rol = 'gerencia'
    and lower(nombre) = 'oscar pacheco'
  order by created_at
  limit 1;

  if v_actor is null then
    raise exception 'No se encontró el perfil activo de Gerencia para registrar la corrección';
  end if;

  if (
    select count(*)
    from public.unidades u
    join public.productos p on p.id = u.producto_id
    join public.remision_items ri on ri.id = u.remision_item_id
    join public.remisiones r on r.id = ri.remision_id
    where u.imei in ('350901806768573', '350901806718933', '350901806768722')
      and u.estado = 'disponible'
      and u.tienda_actual = 'CK-05'
      and p.codigo = '1TK0003'
      and p.nombre = 'SM 17 4+128GB'
      and r.consecutivo = 28
      and r.estado = 'recibida'
      and not exists (
        select 1 from public.venta_items vi where vi.unidad_id = u.id
      )
  ) <> 3 then
    raise exception 'Los tres IMEI originales ya no están disponibles y sin venta en la remisión 28 de Chinú';
  end if;

  if exists (
    select 1
    from public.unidades
    where imei in ('353150404345163', '353150404344976', '353150404307643')
  ) then
    raise exception 'Uno o más IMEI correctos ya existen en inventario';
  end if;

  with correcciones(imei_anterior, imei_nuevo) as (
    values
      ('350901806768573', '353150404345163'),
      ('350901806718933', '353150404344976'),
      ('350901806768722', '353150404307643')
  )
  update public.unidades u
  set imei = c.imei_nuevo
  from correcciones c
  where u.imei = c.imei_anterior;

  get diagnostics v_updated = row_count;
  if v_updated <> 3 then
    raise exception 'La corrección actualizó % unidades; se esperaban 3', v_updated;
  end if;

  insert into public.audit_log (usuario, accion, tabla, registro_id, detalle)
  values (
    v_actor::text,
    'corregir_imeis_remision_28_chinu',
    'unidades',
    'remision-28-chinu',
    jsonb_build_object(
      'store', 'CK-05',
      'remision', 28,
      'product_code', '1TK0003',
      'product_name', 'SM 17 4+128GB',
      'reason', 'Corrección de IMEI digitados incorrectamente al ingresar equipos de Chinú',
      'changes', jsonb_build_array(
        jsonb_build_object('old', '350901806768573', 'new', '353150404345163'),
        jsonb_build_object('old', '350901806718933', 'new', '353150404344976'),
        jsonb_build_object('old', '350901806768722', 'new', '353150404307643')
      )
    )
  );
end;
$$;

commit;

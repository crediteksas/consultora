CREATE OR REPLACE FUNCTION public.crear_registro_cliente_seguro(p_cedula text, p_nombre_completo text, p_celular text, p_email text, p_ciudad text, p_direccion text, p_origen_codigo text, p_captador_id uuid, p_enlace_registro_id uuid, p_otp_id uuid, p_producto_interes text, p_financiera text, p_referencias jsonb, p_autorizacion_comercial boolean, p_autorizacion_version text)
 RETURNS TABLE(cliente_id uuid, solicitud_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cliente_id uuid;
  v_solicitud_id uuid;
  v_captador_nombre text;
  v_otp_id uuid;
begin
  perform 1
  from public.enlaces_registro
  where id = p_enlace_registro_id
    and origen_codigo = p_origen_codigo
    and activo = true
    and revoked_at is null
    and (captador_id is null or captador_id = p_captador_id);
  if not found then
    raise exception 'enlace_invalido';
  end if;

  select nombre into v_captador_nombre
  from public.captadores
  where id = p_captador_id
    and origen_codigo = p_origen_codigo
    and activo = true;
  if v_captador_nombre is null then
    raise exception 'captador_invalido';
  end if;

  update public.otp_codigos
  set registro_consumido_at = now()
  where id = p_otp_id
    and cedula = p_cedula
    and celular = p_celular
    and enlace_registro_id = p_enlace_registro_id
    and verificado = true
    and registro_consumido_at is null
    and envio_aceptado_at is not null
    and envio_fallido_at is null
  returning id into v_otp_id;
  if v_otp_id is null then
    raise exception 'otp_invalido_o_consumido';
  end if;

  insert into public.clientes (
    cedula, nombre_completo, celular, celular_verificado, email, ciudad,
    direccion, origen_codigo, fuente, autorizacion_datos,
    autorizacion_comercial, autorizacion_timestamp,
    autorizacion_version, updated_at
  ) values (
    p_cedula, btrim(p_nombre_completo), p_celular, true,
    nullif(btrim(coalesce(p_email, '')), ''), btrim(p_ciudad),
    btrim(p_direccion), p_origen_codigo, 'formulario', true,
    p_autorizacion_comercial, now(), p_autorizacion_version, now()
  )
  on conflict (cedula) do update set
    nombre_completo = excluded.nombre_completo,
    celular = excluded.celular,
    celular_verificado = true,
    email = coalesce(excluded.email, public.clientes.email),
    ciudad = excluded.ciudad,
    direccion = excluded.direccion,
    autorizacion_datos = true,
    autorizacion_comercial = excluded.autorizacion_comercial,
    autorizacion_timestamp = excluded.autorizacion_timestamp,
    autorizacion_version = excluded.autorizacion_version,
    updated_at = now()
  returning id into v_cliente_id;

  insert into public.solicitudes (
    cliente_id, origen_codigo, captador_id, enlace_registro_id,
    vendedor_nombre, producto_interes, financiera, estado_validacion
  ) values (
    v_cliente_id, p_origen_codigo, p_captador_id, p_enlace_registro_id,
    v_captador_nombre, nullif(btrim(p_producto_interes), ''),
    nullif(p_financiera, ''), 'pendiente'
  )
  returning id into v_solicitud_id;

  insert into public.referencias (
    cliente_id, nombre, telefono, parentesco
  )
  select
    v_cliente_id,
    btrim(x.nombre),
    btrim(x.telefono),
    nullif(btrim(x.parentesco), '')
  from jsonb_to_recordset(coalesce(p_referencias, '[]'::jsonb))
    as x(nombre text, telefono text, parentesco text)
  where length(btrim(coalesce(x.nombre, ''))) >= 2
    and btrim(coalesce(x.telefono, '')) ~ '^3[0-9]{9}$'
  limit 2;

  insert into public.audit_log (
    usuario, accion, tabla, registro_id, detalle
  ) values (
    v_captador_nombre, 'registro_formulario_seguro', 'solicitudes',
    v_solicitud_id::text,
    jsonb_build_object(
      'origen_codigo', p_origen_codigo,
      'captador_id', p_captador_id,
      'enlace_registro_id', p_enlace_registro_id
    )
  );

  return query select v_cliente_id, v_solicitud_id;
end;
$function$

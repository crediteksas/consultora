begin;

do $preflight$
begin
  if to_regclass('public.clientes') is null
     or to_regclass('public.solicitudes') is null
     or to_regclass('public.perfiles') is null
     or to_regclass('public.audit_log') is null then
    raise exception 'Faltan tablas requeridas para el registro interno';
  end if;
end;
$preflight$;

create or replace function public.crear_cliente_interno_seguro(
  p_cedula text,
  p_nombre_completo text,
  p_celular text,
  p_email text,
  p_ciudad text,
  p_direccion text,
  p_origen_codigo text,
  p_producto_interes text default null,
  p_financiera text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_perfil public.perfiles%rowtype;
  v_cliente_id uuid;
  v_solicitud_id uuid;
begin
  select * into v_perfil
  from public.perfiles
  where id = auth.uid();

  if not found
     or v_perfil.rol not in ('gerencia','auditoria','admin_tienda','asesor') then
    raise exception 'registro_cliente_no_autorizado';
  end if;
  if not v_perfil.activo then
    raise exception 'vendedor_deshabilitado';
  end if;
  if v_perfil.rol in ('admin_tienda','asesor')
     and v_perfil.tienda_codigo is distinct from p_origen_codigo then
    raise exception 'registro_cliente_tienda_no_autorizada';
  end if;
  if p_cedula !~ '^[0-9]{5,12}$'
     or p_celular !~ '^3[0-9]{9}$'
     or length(btrim(coalesce(p_nombre_completo,''))) < 3
     or nullif(btrim(coalesce(p_origen_codigo,'')), '') is null then
    raise exception 'datos_cliente_invalidos';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('cliente:cedula:' || p_cedula, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('cliente:celular:' || p_celular, 0)
  );

  if exists (select 1 from public.clientes where cedula = p_cedula) then
    raise exception 'ya_existe_cliente_cedula';
  end if;
  if exists (select 1 from public.clientes where celular = p_celular) then
    raise exception 'ya_existe_cliente_celular';
  end if;

  insert into public.clientes(
    cedula, nombre_completo, celular, celular_verificado, email, ciudad,
    direccion, origen_codigo, fuente, autorizacion_datos,
    autorizacion_comercial, autorizacion_timestamp,
    autorizacion_version, updated_at
  ) values (
    p_cedula, btrim(p_nombre_completo), p_celular, false,
    nullif(btrim(coalesce(p_email,'')), ''), btrim(p_ciudad),
    btrim(p_direccion), p_origen_codigo, 'formulario', true,
    false, now(), 'interno-v1-jul2026', now()
  )
  returning id into v_cliente_id;

  insert into public.solicitudes(
    cliente_id, origen_codigo, vendedor_nombre,
    producto_interes, financiera, estado_validacion
  ) values (
    v_cliente_id, p_origen_codigo, coalesce(v_perfil.nombre, auth.uid()::text),
    nullif(btrim(coalesce(p_producto_interes,'')), ''),
    nullif(btrim(coalesce(p_financiera,'')), ''), 'pendiente'
  )
  returning id into v_solicitud_id;

  insert into public.audit_log(usuario, accion, tabla, registro_id, detalle)
  values (
    coalesce(v_perfil.nombre, auth.uid()::text),
    'registro_cliente_interno', 'solicitudes', v_solicitud_id::text,
    jsonb_build_object(
      'origen_codigo', p_origen_codigo,
      'creado_por', auth.uid(),
      'fuente', 'formulario'
    )
  );

  return jsonb_build_object(
    'ok', true, 'cliente_id', v_cliente_id, 'solicitud_id', v_solicitud_id
  );
end;
$$;

revoke all on function public.crear_cliente_interno_seguro(
  text,text,text,text,text,text,text,text,text
) from public, anon;
grant execute on function public.crear_cliente_interno_seguro(
  text,text,text,text,text,text,text,text,text
) to authenticated;

commit;

begin;

do $preflight$
begin
  if to_regclass('public.abonos') is null
     or to_regclass('public.cuenta_corriente') is null
     or to_regclass('public.movimientos_caja_tienda') is null
     or to_regclass('public.perfiles') is null then
    raise exception 'Faltan tablas requeridas para registrar abonos';
  end if;
end;
$preflight$;

alter table public.abonos
  add column if not exists fecha date,
  add column if not exists tipo_movimiento text,
  add column if not exists tercero text,
  add column if not exists concepto text,
  add column if not exists fuente_fondos text,
  add column if not exists observacion text,
  add column if not exists idempotency_key uuid,
  add column if not exists movimiento_caja_id uuid
    references public.movimientos_caja_tienda(id);

create unique index if not exists abonos_idempotency_key_uidx
  on public.abonos(idempotency_key)
  where idempotency_key is not null;

create or replace function public.registrar_abono_cuenta_corriente(
  p_tienda_codigo text,
  p_fecha date,
  p_tipo_movimiento text,
  p_tercero text,
  p_concepto text,
  p_monto numeric,
  p_fuente_fondos text,
  p_observacion text,
  p_soporte_path text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_perfil public.perfiles%rowtype;
  v_abono_id uuid;
  v_movimiento_id uuid;
begin
  select * into v_perfil
  from public.perfiles
  where id = auth.uid() and activo = true;

  if not found or not (
    v_perfil.rol in ('gerencia', 'auditoria')
    or (v_perfil.rol = 'admin_tienda' and v_perfil.tienda_codigo = p_tienda_codigo)
  ) then
    raise exception 'No autorizado para registrar este abono';
  end if;
  if p_fecha is null or p_monto is null or p_monto <= 0
     or nullif(btrim(p_concepto), '') is null
     or nullif(btrim(p_soporte_path), '') is null
     or p_idempotency_key is null then
    raise exception 'Fecha, concepto, monto, soporte e idempotencia son obligatorios';
  end if;
  if p_tipo_movimiento not in ('abono_tienda', 'pago_socio')
     or p_fuente_fondos not in ('sin_afectar_caja', 'efectivo_tienda') then
    raise exception 'Tipo de movimiento o fuente de fondos inválida';
  end if;

  select id, movimiento_caja_id into v_abono_id, v_movimiento_id
  from public.abonos
  where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'ok', true, 'reutilizado', true, 'abono_id', v_abono_id,
      'movimiento_caja_id', v_movimiento_id
    );
  end if;

  insert into public.abonos (
    tienda_codigo, monto, soporte_path, registrado_por, fecha,
    tipo_movimiento, tercero, concepto, fuente_fondos, observacion,
    idempotency_key
  ) values (
    p_tienda_codigo, p_monto, btrim(p_soporte_path), auth.uid(), p_fecha,
    p_tipo_movimiento, nullif(btrim(coalesce(p_tercero, '')), ''),
    btrim(p_concepto), p_fuente_fondos,
    nullif(btrim(coalesce(p_observacion, '')), ''), p_idempotency_key
  )
  returning id into v_abono_id;

  insert into public.cuenta_corriente (
    tienda_codigo, tipo, concepto, monto,
    referencia_tipo, referencia_id, usuario
  ) values (
    p_tienda_codigo, 'abono', btrim(p_concepto), p_monto,
    'abono', v_abono_id, auth.uid()
  );

  if p_fuente_fondos = 'efectivo_tienda' then
    insert into public.movimientos_caja_tienda (
      tienda_codigo, fecha, tipo, monto, soporte_path, observacion,
      autorizado_por, creado_por, idempotency_key
    ) values (
      p_tienda_codigo, p_fecha, 'consignacion', p_monto,
      btrim(p_soporte_path),
      coalesce(nullif(btrim(coalesce(p_observacion, '')), ''), btrim(p_concepto)),
      auth.uid(), auth.uid(), p_idempotency_key
    )
    returning id into v_movimiento_id;

    update public.abonos
    set movimiento_caja_id = v_movimiento_id
    where id = v_abono_id;
  end if;

  insert into public.audit_log(usuario, accion, tabla, registro_id, detalle)
  values (
    coalesce(v_perfil.nombre, auth.uid()::text),
    'registrar_abono_cuenta_corriente',
    'abonos',
    v_abono_id::text,
    jsonb_build_object(
      'tienda_codigo', p_tienda_codigo,
      'fuente_fondos', p_fuente_fondos,
      'movimiento_caja_id', v_movimiento_id
    )
  );

  return jsonb_build_object(
    'ok', true, 'reutilizado', false, 'abono_id', v_abono_id,
    'movimiento_caja_id', v_movimiento_id
  );
end;
$$;

revoke all on function public.registrar_abono_cuenta_corriente(
  text, date, text, text, text, numeric, text, text, text, uuid
) from public, anon;
grant execute on function public.registrar_abono_cuenta_corriente(
  text, date, text, text, text, numeric, text, text, text, uuid
) to authenticated;

commit;

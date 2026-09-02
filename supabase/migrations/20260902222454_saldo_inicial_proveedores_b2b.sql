begin;

do $preflight$
begin
  if to_regclass('public.proveedores') is null
     or to_regclass('public.facturas_proveedor') is null
     or to_regclass('public.perfiles') is null
     or to_regclass('public.audit_log') is null then
    raise exception 'Faltan tablas requeridas para saldos iniciales B2B';
  end if;
end;
$preflight$;

alter table public.facturas_proveedor
  add column if not exists origen_registro text,
  add column if not exists registrado_por uuid references auth.users(id);

create unique index if not exists facturas_proveedor_saldo_inicial_unico
  on public.facturas_proveedor(proveedor_id)
  where origen_registro = 'saldo_inicial';

create or replace function public.registrar_saldo_inicial_proveedor(
  p_proveedor_id uuid,
  p_fecha_corte date,
  p_fecha_vencimiento date,
  p_monto numeric,
  p_referencia text,
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
  v_proveedor public.proveedores%rowtype;
  v_factura public.facturas_proveedor%rowtype;
  v_numero text;
begin
  select * into v_perfil
  from public.perfiles
  where id = auth.uid() and activo = true;

  if not found or v_perfil.rol not in ('gerencia', 'auditoria') then
    raise exception 'Solo Gerencia o Auditoría pueden registrar saldos iniciales de proveedores';
  end if;

  if p_proveedor_id is null or p_fecha_corte is null
     or p_monto is null or p_monto <= 0
     or nullif(btrim(coalesce(p_soporte_path, '')), '') is null
     or p_idempotency_key is null then
    raise exception 'Proveedor, fecha de corte, monto, soporte e idempotencia son obligatorios';
  end if;

  if p_fecha_vencimiento is not null and p_fecha_vencimiento < p_fecha_corte then
    raise exception 'La fecha de vencimiento no puede ser anterior a la fecha de corte';
  end if;

  select * into v_proveedor
  from public.proveedores
  where id = p_proveedor_id and activo = true;

  if not found then
    raise exception 'El proveedor no existe o está inactivo';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('saldo_inicial_proveedor:' || p_proveedor_id::text, 0));

  select * into v_factura
  from public.facturas_proveedor
  where operacion_idempotency_key = p_idempotency_key;

  if found then
    if v_factura.proveedor_id <> p_proveedor_id or v_factura.total <> p_monto
       or v_factura.origen_registro <> 'saldo_inicial' then
      raise exception 'La llave de idempotencia ya fue usada con otra operación';
    end if;
    return jsonb_build_object(
      'ok', true,
      'reutilizado', true,
      'factura_id', v_factura.id,
      'saldo', v_factura.saldo
    );
  end if;

  if exists (
    select 1 from public.facturas_proveedor
    where proveedor_id = p_proveedor_id and origen_registro = 'saldo_inicial'
  ) then
    raise exception 'Este proveedor ya tiene un saldo inicial registrado';
  end if;

  v_numero := coalesce(
    nullif(btrim(coalesce(p_referencia, '')), ''),
    'SALDO-INICIAL-' || to_char(p_fecha_corte, 'YYYYMMDD')
  );

  insert into public.facturas_proveedor (
    proveedor_id, numero, fecha, fecha_vencimiento,
    total, saldo, soporte_path, nota, tipo_compra,
    operacion_idempotency_key, origen_registro, registrado_por
  ) values (
    p_proveedor_id, v_numero, p_fecha_corte, p_fecha_vencimiento,
    p_monto, p_monto, btrim(p_soporte_path),
    concat('Saldo anterior al inicio en KORA',
      case when nullif(btrim(coalesce(p_observacion, '')), '') is not null
        then ' · ' || btrim(p_observacion) else '' end),
    'credito', p_idempotency_key, 'saldo_inicial', auth.uid()
  ) returning * into v_factura;

  insert into public.audit_log(usuario, accion, tabla, registro_id, detalle)
  values (
    coalesce(v_perfil.nombre, auth.uid()::text),
    'registrar_saldo_inicial_proveedor',
    'facturas_proveedor',
    v_factura.id::text,
    jsonb_build_object(
      'proveedor_id', p_proveedor_id,
      'proveedor_nombre', v_proveedor.nombre,
      'fecha_corte', p_fecha_corte,
      'fecha_vencimiento', p_fecha_vencimiento,
      'monto', p_monto,
      'soporte_path', btrim(p_soporte_path)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'reutilizado', false,
    'factura_id', v_factura.id,
    'saldo', v_factura.saldo
  );
end;
$$;

revoke all on function public.registrar_saldo_inicial_proveedor(
  uuid, date, date, numeric, text, text, text, uuid
) from public, anon;
grant execute on function public.registrar_saldo_inicial_proveedor(
  uuid, date, date, numeric, text, text, text, uuid
) to authenticated;

commit;

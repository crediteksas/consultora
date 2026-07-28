-- KORA-2026-000003 · Verificación central y pago de proveedor.
-- Aditiva. No modifica movimientos históricos ni vuelve a aplicar el abono a la tienda.
begin;

do $preflight$
begin
  if to_regclass('public.abonos') is null
     or to_regclass('public.cuenta_corriente') is null
     or to_regclass('public.facturas_proveedor') is null
     or to_regclass('public.perfiles') is null
     or to_regprocedure('public.registrar_pago_proveedor(uuid,numeric,date,text,text,text,text,uuid)') is null then
    raise exception 'Faltan dependencias para verificar abonos contra proveedores';
  end if;
end;
$preflight$;

alter table public.abonos
  add column if not exists factura_proveedor_id uuid
    references public.facturas_proveedor(id) on delete restrict,
  add column if not exists verificacion_idempotency_key uuid;

create unique index if not exists abonos_verificacion_idempotency_uidx
  on public.abonos(verificacion_idempotency_key)
  where verificacion_idempotency_key is not null;

create or replace function public.listar_cuenta_corriente_con_abonos()
returns setof jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_perfil public.perfiles%rowtype;
begin
  select * into v_perfil
  from public.perfiles
  where id = auth.uid() and activo = true;

  if not found then
    raise exception 'Perfil activo requerido';
  end if;

  return query
  select
    to_jsonb(cc)
    || jsonb_build_object(
      'verificado_at', a.verificado_at,
      'verificado_por', a.verificado_por,
      'factura_proveedor_id', a.factura_proveedor_id
    )
  from public.cuenta_corriente cc
  left join public.abonos a
    on cc.referencia_tipo = 'abono'
   and cc.referencia_id::text = a.id::text
  where v_perfil.rol in ('gerencia', 'auditoria')
     or cc.tienda_codigo = v_perfil.tienda_codigo
  order by cc.created_at;
end;
$$;

create or replace function public.verificar_abono_y_registrar_pago(
  p_abono_id uuid,
  p_factura_proveedor_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_perfil public.perfiles%rowtype;
  v_abono public.abonos%rowtype;
  v_movimientos integer;
  v_pago jsonb;
begin
  select * into v_perfil
  from public.perfiles
  where id = auth.uid() and activo = true;

  if not found or v_perfil.rol not in ('gerencia', 'auditoria') then
    raise exception 'Solo gerencia o auditoría pueden verificar abonos';
  end if;
  if p_factura_proveedor_id is null or p_request_id is null then
    raise exception 'Factura de proveedor e idempotencia son obligatorias';
  end if;

  select * into v_abono
  from public.abonos
  where id = p_abono_id
  for update;

  if not found then
    raise exception 'Abono no encontrado';
  end if;

  if v_abono.verificado_at is not null then
    if v_abono.factura_proveedor_id is distinct from p_factura_proveedor_id then
      raise exception 'El abono ya fue verificado contra otra factura';
    end if;
    return jsonb_build_object(
      'ok', true,
      'reutilizado', true,
      'abono_id', v_abono.id,
      'factura_proveedor_id', v_abono.factura_proveedor_id
    );
  end if;

  select count(*) into v_movimientos
  from public.cuenta_corriente
  where referencia_tipo = 'abono'
    and referencia_id::text = v_abono.id::text;

  if v_movimientos = 0 then
    raise exception 'Movimiento de cuenta corriente no encontrado';
  elsif v_movimientos > 1 then
    raise exception 'El abono tiene movimientos duplicados y requiere revisión';
  end if;

  v_pago := public.registrar_pago_proveedor(
    p_factura_proveedor_id,
    v_abono.monto,
    coalesce(v_abono.fecha, current_date),
    'Abono de tienda',
    v_abono.tienda_codigo,
    v_abono.soporte_path,
    'Aplicado desde cuenta corriente',
    p_request_id
  );

  if not coalesce((v_pago->>'ok')::boolean, false) then
    raise exception 'El pago de proveedor no fue confirmado';
  end if;

  update public.abonos
  set verificado_por = auth.uid(),
      verificado_at = now(),
      factura_proveedor_id = p_factura_proveedor_id,
      verificacion_idempotency_key = p_request_id
  where id = v_abono.id;

  return jsonb_build_object(
    'ok', true,
    'reutilizado', false,
    'abono_id', v_abono.id,
    'factura_proveedor_id', p_factura_proveedor_id,
    'pago_id', v_pago->>'pago_id',
    'saldo_factura', v_pago->'saldo'
  );
end;
$$;

revoke all on function public.listar_cuenta_corriente_con_abonos()
  from public, anon;
grant execute on function public.listar_cuenta_corriente_con_abonos()
  to authenticated;

revoke all on function public.verificar_abono_y_registrar_pago(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.verificar_abono_y_registrar_pago(uuid, uuid, uuid)
  to authenticated;

commit;

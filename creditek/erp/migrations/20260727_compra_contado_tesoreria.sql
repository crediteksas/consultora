begin;

do $preflight$
begin
  if to_regclass('public.facturas_proveedor') is null
     or to_regclass('public.pagos_proveedor') is null
     or to_regprocedure('public.registrar_compra_proveedor(uuid,text,date,jsonb,text,text)') is null
     or to_regprocedure('public.registrar_pago_proveedor(uuid,numeric,date,text,text,text,text,uuid)') is null then
    raise exception 'Falta la infraestructura base de compras o pagos a proveedores';
  end if;
end;
$preflight$;

alter table public.facturas_proveedor
  add column if not exists tipo_compra text,
  add column if not exists operacion_idempotency_key uuid;

create unique index if not exists facturas_proveedor_operacion_idempotency_uidx
  on public.facturas_proveedor(operacion_idempotency_key)
  where operacion_idempotency_key is not null;

create table if not exists public.movimientos_tesoreria_central (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  tipo text not null check (tipo in ('compra_contado', 'reverso_compra_contado')),
  fuente_fondos text not null check (fuente_fondos in ('caja_central', 'banco_corporativo')),
  monto numeric not null check (monto > 0),
  referencia_tipo text not null,
  referencia_id uuid not null,
  soporte_path text,
  observacion text,
  creado_por uuid not null default auth.uid(),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now()
);

alter table public.movimientos_tesoreria_central enable row level security;
drop policy if exists movimientos_tesoreria_central_select on public.movimientos_tesoreria_central;
create policy movimientos_tesoreria_central_select
on public.movimientos_tesoreria_central
for select to authenticated
using (coalesce(public.es_central(), false));
revoke all on public.movimientos_tesoreria_central from public, anon;
revoke insert, update, delete on public.movimientos_tesoreria_central from authenticated;
grant select on public.movimientos_tesoreria_central to authenticated;

create or replace function public.registrar_compra_proveedor_operativa(
  p_proveedor_id uuid,
  p_numero_factura text,
  p_fecha date,
  p_tipo_compra text,
  p_fecha_vencimiento date,
  p_fuente_fondos text,
  p_items jsonb,
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
  v_resultado jsonb;
  v_pago jsonb;
  v_factura_id uuid;
  v_total numeric;
begin
  if not coalesce(public.es_central(), false) then
    raise exception 'Solo gerencia o auditoría pueden registrar compras';
  end if;
  if p_idempotency_key is null then
    raise exception 'La llave de idempotencia es requerida';
  end if;
  if p_tipo_compra not in ('credito', 'contado') then
    raise exception 'Tipo de compra inválido';
  end if;
  if p_tipo_compra = 'credito' and p_fecha_vencimiento is null then
    raise exception 'La fecha de vencimiento es requerida';
  end if;
  if p_tipo_compra = 'contado'
     and p_fuente_fondos not in ('caja_central', 'banco_corporativo') then
    raise exception 'La fuente de fondos es requerida para compras de contado';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
  select id, total into v_factura_id, v_total
  from public.facturas_proveedor
  where operacion_idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'ok', true, 'reutilizado', true, 'factura_id', v_factura_id,
      'total', v_total, 'tipo_compra', p_tipo_compra
    );
  end if;

  v_resultado := public.registrar_compra_proveedor(
    p_proveedor_id, p_numero_factura, p_fecha, p_items,
    p_soporte_path, p_nota
  );
  v_factura_id := (v_resultado->>'factura_id')::uuid;
  v_total := (v_resultado->>'total')::numeric;

  update public.facturas_proveedor
  set tipo_compra = p_tipo_compra,
      fecha_vencimiento = case when p_tipo_compra = 'credito' then p_fecha_vencimiento else null end,
      operacion_idempotency_key = p_idempotency_key
  where id = v_factura_id;

  if p_tipo_compra = 'contado' then
    v_pago := public.registrar_pago_proveedor(
      v_factura_id, v_total, p_fecha, p_fuente_fondos,
      p_numero_factura, p_soporte_path, 'Compra pagada de contado',
      p_idempotency_key
    );
    insert into public.movimientos_tesoreria_central(
      fecha, tipo, fuente_fondos, monto, referencia_tipo, referencia_id,
      soporte_path, observacion, idempotency_key
    ) values (
      p_fecha, 'compra_contado', p_fuente_fondos, v_total,
      'factura_proveedor', v_factura_id, p_soporte_path,
      coalesce(nullif(btrim(coalesce(p_nota, '')), ''), 'Compra de contado ' || p_numero_factura),
      p_idempotency_key
    );
  end if;

  return v_resultado || jsonb_build_object(
    'tipo_compra', p_tipo_compra,
    'pagada', p_tipo_compra = 'contado',
    'fuente_fondos', p_fuente_fondos
  );
end;
$$;

revoke all on function public.registrar_compra_proveedor_operativa(
  uuid, text, date, text, date, text, jsonb, text, text, uuid
) from public, anon;
grant execute on function public.registrar_compra_proveedor_operativa(
  uuid, text, date, text, date, text, jsonb, text, text, uuid
) to authenticated;

commit;

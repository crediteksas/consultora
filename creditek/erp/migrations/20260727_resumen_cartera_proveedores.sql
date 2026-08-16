-- Resumen de cartera: vencimiento explícito y compra atómica con fecha de vencimiento.

alter table public.facturas_proveedor
  add column if not exists fecha_vencimiento date;

create index if not exists facturas_proveedor_vencimiento_idx
  on public.facturas_proveedor (fecha_vencimiento)
  where saldo > 0;

create or replace function public.registrar_compra_proveedor_con_vencimiento(
  p_proveedor_id uuid,
  p_numero_factura text,
  p_fecha date,
  p_fecha_vencimiento date,
  p_items jsonb,
  p_soporte_path text default null,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resultado jsonb;
  v_factura_id uuid;
begin
  if not coalesce(public.es_central(), false) then
    raise exception 'No autorizado';
  end if;

  if p_fecha_vencimiento is null then
    raise exception 'La fecha de vencimiento es requerida';
  end if;

  v_resultado := public.registrar_compra_proveedor(
    p_proveedor_id,
    p_numero_factura,
    p_fecha,
    p_items,
    p_soporte_path,
    p_nota
  );
  v_factura_id := (v_resultado->>'factura_id')::uuid;

  update public.facturas_proveedor
  set fecha_vencimiento = p_fecha_vencimiento
  where id = v_factura_id;

  return v_resultado || jsonb_build_object('fecha_vencimiento', p_fecha_vencimiento);
end;
$$;

revoke all on function public.registrar_compra_proveedor_con_vencimiento(
  uuid, text, date, date, jsonb, text, text
) from public, anon;
grant execute on function public.registrar_compra_proveedor_con_vencimiento(
  uuid, text, date, date, jsonb, text, text
) to authenticated;

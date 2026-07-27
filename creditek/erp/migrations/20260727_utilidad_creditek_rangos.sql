-- Detalle diario de utilidad Creditek. Conserva la fórmula histórica:
-- facturado a tiendas - costo real congelado de la remisión.

create or replace view public.utilidad_creditek_rango
with (security_invoker = on, security_barrier = on)
as
select
  rm.id as margen_id,
  (r.despachada_at at time zone 'America/Bogota')::date as fecha,
  r.id as remision_id,
  r.consecutivo,
  r.tienda_codigo,
  ri.id as remision_item_id,
  p.id as producto_id,
  p.codigo as referencia,
  p.nombre as producto_nombre,
  p.categoria,
  p.tipo,
  plataforma.financiera as plataforma,
  rm.cantidad,
  ri.precio_remision,
  rm.costo_oscar,
  (ri.precio_remision * rm.cantidad) as facturado,
  (rm.costo_oscar * rm.cantidad) as costo,
  ((ri.precio_remision - rm.costo_oscar) * rm.cantidad) as utilidad
from public.remision_margenes rm
join public.remision_items ri on ri.id = rm.remision_item_id
join public.remisiones r on r.id = ri.remision_id
join public.productos p on p.id = ri.producto_id
left join lateral (
  select c.financiera
  from public.venta_items vi
  join public.ventas v on v.id = vi.venta_id
  join public.creditos c on c.venta_id = v.id
  where rm.unidad_id is not null
    and vi.unidad_id = rm.unidad_id
    and coalesce(v.anulada, false) = false
  order by v.fecha desc, v.created_at desc, c.created_at desc
  limit 1
) plataforma on true
where r.despachada_at is not null;

revoke all on public.utilidad_creditek_rango from public, anon;
grant select on public.utilidad_creditek_rango to authenticated;

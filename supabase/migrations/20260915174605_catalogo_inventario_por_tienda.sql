-- Catálogo retail: solo referencias con existencias disponibles de la propia tienda.
-- No cambia stock, costos, remisiones ni el catálogo maestro usado por administración.
begin;
create view public.catalogo_tienda_lectura with (security_invoker=true,security_barrier=true) as
with existencias as (
  select producto_id,tienda_codigo,precio_tienda from public.stock_cantidad
    where tienda_codigo=(select public.tienda_actual()) and cantidad>0
  union all
  select producto_id,tienda_actual,precio_tienda from public.unidades
    where tienda_actual=(select public.tienda_actual()) and estado='disponible'
), propios as (
  select producto_id,tienda_codigo,min(precio_tienda) as costo_min,max(precio_tienda) as costo_max
  from existencias group by producto_id,tienda_codigo
)
select p.id,p.codigo,p.nombre,p.categoria,p.tipo,p.foto_url,p.activo,
       e.tienda_codigo,e.costo_min,e.costo_max
from public.productos p join propios e on e.producto_id=p.id
where p.activo and (select auth.uid()) is not null;
revoke all on public.catalogo_tienda_lectura from public,anon,authenticated;
grant select on public.catalogo_tienda_lectura to authenticated;
comment on view public.catalogo_tienda_lectura is 'Inventario propio disponible. RLS y tienda del perfil activo; sin costo proveedor. Catálogo maestro separado para administración.';
notify pgrst,'reload schema';
commit;

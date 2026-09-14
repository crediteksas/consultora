-- Apply after the frontend uses the read projections. Direct API requests
-- for internal columns (including select *) now fail, regardless of row RLS.
revoke select on public.movimientos from public,anon,authenticated;
revoke select (costo) on public.movimientos from public,anon,authenticated;
grant select (id,tipo,tienda_codigo,producto_id,unidad_id,cantidad,precio,referencia_tipo,referencia_id,reverso_de,usuario,nota,created_at,costo_tienda) on public.movimientos to authenticated;
revoke select on public.stock_cantidad from public,anon,authenticated;
revoke select (costo_promedio) on public.stock_cantidad from public,anon,authenticated;
grant select (producto_id,tienda_codigo,cantidad,updated_at,precio_tienda,factura_proveedor_id) on public.stock_cantidad to authenticated;
revoke select on public.unidades from public,anon,authenticated;
revoke select (costo_remision) on public.unidades from public,anon,authenticated;
grant select (id,producto_id,imei,estado,tienda_actual,remision_item_id,created_at,factura_proveedor_id,precio_tienda) on public.unidades to authenticated;
revoke select on public.venta_items from public,anon,authenticated;
revoke select (costo_congelado,utilidad,costo_remision_congelado) on public.venta_items from public,anon,authenticated;
grant select (id,venta_id,producto_id,unidad_id,cantidad,precio_venta,costo_tienda_congelado,estado_costo_tienda) on public.venta_items to authenticated;
revoke select on public.traslado_items from public,anon,authenticated;
revoke select (costo) on public.traslado_items from public,anon,authenticated;
grant select (id,traslado_id,producto_id,unidad_id,cantidad,precio_tienda) on public.traslado_items to authenticated;
notify pgrst,'reload schema';

create index venta_devoluciones_venta on public.venta_devoluciones(venta_id);
create index venta_devoluciones_producto on public.venta_devoluciones(producto_id);
create index venta_devoluciones_responsable on public.venta_devoluciones(registrado_por);
create index venta_devoluciones_movimiento on public.venta_devoluciones(movimiento_inventario_id);
alter policy devoluciones_lectura on public.venta_devoluciones using (
 estado='aplicada' and exists(select 1 from public.perfiles p where p.id=(select auth.uid()) and p.activo
 and (p.rol in ('gerencia','auditoria') or (p.rol='admin_tienda' and p.tienda_codigo=venta_devoluciones.tienda_codigo)))
);
-- Legacy cash closure also retains original received cash, not the net returned sale.
do $$
declare def text; needle text;
begin
 def:=pg_get_functiondef('public.cerrar_caja(text,date,numeric,text)'::regprocedure);
 needle:=$n$select coalesce(sum(vi.precio_venta * vi.cantidad), 0) into v_contado_ventas
  from ventas v join venta_items vi on vi.venta_id = v.id$n$;
 if position(needle in def)=0 then raise exception 'Revisar versión de cierre legacy'; end if;
 execute replace(def,needle,'select coalesce(sum(v.total + v.efectivo_devuelto_registrado), 0) into v_contado_ventas from ventas v');
end $$;

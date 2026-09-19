begin;
-- precio_tienda es COSTO Retail. El precio comercial permanece en
-- productos.precio_guia y movimientos.precio. Mantener las fórmulas de
-- promedio y los permisos vigentes: no reabrir este RPC a authenticated.
do $patch$
declare
  v_definition text := pg_get_functiondef('public.inventario_importar_inicial_excel(text,jsonb,text)'::regprocedure);
  v_before_acl aclitem[];
  v_after_acl aclitem[];
  v_old text;
  v_new text;
begin
  select proacl into v_before_acl from pg_proc
    where oid = 'public.inventario_importar_inicial_excel(text,jsonb,text)'::regprocedure;
  for v_old, v_new in select * from (values
    ($old$values (v_producto.id, v_imei, 'disponible', p_tienda_codigo, v_costo, v_precio)$old$,
     $new$values (v_producto.id, v_imei, 'disponible', p_tienda_codigo, v_costo, v_costo)$new$),
    ($old$values (v_producto.id, p_tienda_codigo, v_cantidad, v_costo, v_precio)$old$,
     $new$values (v_producto.id, p_tienda_codigo, v_cantidad, v_costo, v_costo)$new$),
    ($old$precio_tienda = ((public.stock_cantidad.cantidad * coalesce(public.stock_cantidad.precio_tienda, 0)) + (v_cantidad * v_precio))$old$,
     $new$precio_tienda = ((public.stock_cantidad.cantidad * coalesce(public.stock_cantidad.precio_tienda, 0)) + (v_cantidad * v_costo))$new$)
  ) as replacements(old_value,new_value) loop
    if (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old) <> 1 then
      raise exception 'El importador cambió: no se puede aplicar la corrección de costos automáticamente';
    end if;
    v_definition := replace(v_definition,v_old,v_new);
  end loop;
  execute v_definition;
  select proacl into v_after_acl from pg_proc
    where oid = 'public.inventario_importar_inicial_excel(text,jsonb,text)'::regprocedure;
  if v_after_acl is distinct from v_before_acl then raise exception 'Los permisos del importador cambiaron'; end if;
end;
$patch$;
commit;

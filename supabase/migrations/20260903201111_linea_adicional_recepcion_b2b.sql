begin;

create or replace function public.agregar_linea_adicional_orden_b2b(
  p_orden_id uuid,
  p_producto_id uuid,
  p_tienda_destino text,
  p_cantidad integer,
  p_costo_unitario numeric,
  p_precio_tienda numeric,
  p_motivo text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_item public.orden_compra_items%rowtype;
begin
  if not coalesce(public.es_central(),false) then
    raise exception 'Solo Gestión o Gerencia pueden aceptar referencias adicionales';
  end if;
  if not exists(select 1 from public.ordenes_compra where id=p_orden_id and estado in ('enviada','recepcion_parcial')) then
    raise exception 'La orden no está disponible para recibir adiciones';
  end if;
  if not exists(select 1 from public.productos where id=p_producto_id and activo=true) then raise exception 'Referencia inválida'; end if;
  if not exists(select 1 from public.origenes where codigo=p_tienda_destino and tipo='propia' and activo=true) then raise exception 'Tienda destino inválida'; end if;
  if coalesce(p_cantidad,0)<=0 or coalesce(p_costo_unitario,-1)<0 or coalesce(p_precio_tienda,-1)<0 then raise exception 'Cantidad, costo o precio inválidos'; end if;
  if nullif(btrim(coalesce(p_motivo,'')),'') is null then raise exception 'El motivo de la adición es obligatorio'; end if;

  insert into public.orden_compra_items(
    orden_id,pedido_item_id,producto_id,tienda_destino,cantidad_ordenada,
    costo_cotizado,precio_tienda_cotizado,motivo_ajuste
  ) values (
    p_orden_id,null,p_producto_id,p_tienda_destino,p_cantidad,
    p_costo_unitario,p_precio_tienda,btrim(p_motivo)
  ) returning * into v_item;

  insert into public.orden_compra_cambios(orden_id,orden_item_id,campo,valor_anterior,valor_nuevo,motivo)
  values(p_orden_id,v_item.id,'referencia_adicional',null,
    jsonb_build_object('producto_id',p_producto_id,'tienda',p_tienda_destino,'cantidad',p_cantidad,'costo',p_costo_unitario,'precio_tienda',p_precio_tienda)::text,
    btrim(p_motivo));

  return jsonb_build_object('ok',true,'orden_item_id',v_item.id);
end;
$$;

revoke all on function public.agregar_linea_adicional_orden_b2b(uuid,uuid,text,integer,numeric,numeric,text) from public, anon;
grant execute on function public.agregar_linea_adicional_orden_b2b(uuid,uuid,text,integer,numeric,numeric,text) to authenticated;

commit;

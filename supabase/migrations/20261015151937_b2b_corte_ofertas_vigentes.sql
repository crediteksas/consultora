begin;

-- Recalcular al revisar el corte, sin reescribir el pedido enviado por la tienda.
-- b2b_mejor_oferta excluye borradores, ofertas vencidas y proveedores inactivos,
-- y resuelve la identidad comercial (incluidas las variantes de color).
create or replace function public.vista_previa_cierre_b2b(p_pedidos uuid[] default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_items jsonb; v_ids jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.perfiles where id=auth.uid() and activo and rol in('gerencia','auditoria')) then raise exception 'Solo Administración puede consultar cierres';end if;
 select coalesce(jsonb_agg(p.id order by p.id),'[]'::jsonb) into v_ids
 from public.pedidos_b2b p
 where p.estado not in('borrador','cancelado') and (p_pedidos is null or p.id=any(p_pedidos))
 and not exists(select 1 from public.b2b_cierre_pedidos cp where cp.pedido_id=p.id);

 select coalesce(jsonb_agg(jsonb_build_object(
  'pedido_id',p.id,'numero','PED-'||lpad(p.consecutivo::text,6,'0'),
  'fecha',p.solicitado_at,'estado',p.estado,'nota',p.nota,
  'tienda',o.nombre,'tienda_codigo',p.tienda_codigo,'ciudad',o.ciudad,
  'item_id',i.id,'producto_id',i.producto_id,
  'referencia',public.nombre_referencia_pedido_b2b(pr.id,pr.nombre),
  'cantidad',i.cantidad_solicitada,'cantidad_ordenada',i.cantidad_ordenada,
  'oferta_id',actual.id,'lista_id',actual.lista_id,
  'precio',actual.precio_tienda,'proveedor_id',actual.proveedor_id,
  'proveedor',proveedor_actual.nombre,'costo',actual.costo,
  'origen',jsonb_build_object('oferta_id',original.id,'precio',i.precio_catalogo,
   'proveedor_id',original.proveedor_id,'proveedor',proveedor_original.nombre,'costo',original.costo)
 ) order by p.id,i.id),'[]'::jsonb) into v_items
 from public.pedidos_b2b p join public.pedido_b2b_items i on i.pedido_id=p.id
 left join public.origenes o on o.codigo=p.tienda_codigo
 left join public.productos pr on pr.id=i.producto_id
 left join public.b2b_referencias_catalogo identidad on identidad.producto_id=i.producto_id
 left join public.b2b_mejor_oferta actual on actual.producto_id=coalesce(identidad.referencia_id,i.producto_id)
 left join public.proveedores proveedor_actual on proveedor_actual.id=actual.proveedor_id
 left join public.b2b_pedido_fuente fuente on fuente.pedido_item_id=i.id
 left join public.b2b_ofertas original on original.id=fuente.oferta_id
 left join public.proveedores proveedor_original on proveedor_original.id=original.proveedor_id
 where v_ids @> jsonb_build_array(p.id);
 return jsonb_build_object('pedido_ids',v_ids,'items',v_items,'huella',md5(v_items::text),
  'pedidos',jsonb_array_length(v_ids),'politica','ofertas_vigentes_al_cierre');
end $$;

create or replace function kora_private.cerrar_periodo_pedidos_b2b(p_pedidos uuid[],p_huella text,p_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.b2b_cierres%rowtype; preview jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.perfiles where id=auth.uid() and activo and rol in('gerencia','auditoria')) then raise exception 'Solo Administración puede cerrar períodos';end if;
 if p_key is null or p_huella is null then raise exception 'Falta la previsualización del cierre';end if;
 -- El publicador de listas usa el mismo bloqueo: no puede cambiar ofertas
 -- entre la validación de la huella y la escritura de la copia confirmada.
 perform pg_advisory_xact_lock(726041701);
 select * into v from public.b2b_cierres where creado_por=auth.uid() and solicitud_key=p_key;
 if found then
  if v.huella<>p_huella then raise exception 'El identificador ya corresponde a otro cierre';end if;
  return jsonb_build_object('id',v.id,'numero','CIE-'||lpad(v.consecutivo::text,6,'0'),'repetido',true);
 end if;
 if p_pedidos is null or cardinality(p_pedidos) not between 1 and 1000 or array_position(p_pedidos,null) is not null
 or (select count(distinct x) from unnest(p_pedidos) x)<>cardinality(p_pedidos) then raise exception 'Selecciona entre 1 y 1000 pedidos distintos';end if;
 perform 1 from public.pedidos_b2b where id=any(p_pedidos) order by id for update;
 preview:=public.vista_previa_cierre_b2b(p_pedidos);
 if (preview->>'pedidos')::int<>cardinality(p_pedidos) or preview->>'huella'<>p_huella then
  raise exception 'Los pedidos, precios o proveedores cambiaron o ya fueron cerrados. Actualiza y revisa nuevamente';end if;
 if jsonb_array_length(preview->'items')=0 or exists(select 1 from jsonb_array_elements(preview->'items') i
  where i->>'oferta_id' is null or i->>'costo' is null or i->>'precio' is null
  or i->>'proveedor_id' is null or i->>'referencia' is null
  or (i->>'costo')::numeric<=0 or (i->>'precio')::numeric<=0) then
  raise exception 'Hay referencias sin oferta publicada vigente. Revisa proveedor, costo y precio antes del cierre';end if;
 if exists(select 1 from jsonb_array_elements(preview->'items') i where (i->>'cantidad_ordenada')::int>0) then
  raise exception 'Hay líneas con compras ya creadas. No se pueden recalcular en este cierre; revisa las órdenes existentes';end if;
 if (select count(distinct i->>'pedido_id') from jsonb_array_elements(preview->'items') i)<>cardinality(p_pedidos) then raise exception 'Hay pedidos sin referencias';end if;
 insert into public.b2b_cierres(creado_por,solicitud_key,huella,reporte)
 values(auth.uid(),p_key,p_huella,preview) returning * into v;
 insert into public.b2b_cierre_pedidos(pedido_id,cierre_id) select x,v.id from unnest(p_pedidos) x;
 insert into kora_private.b2b_cierre_mail_jobs(cierre_id) values(v.id);
 return jsonb_build_object('id',v.id,'numero','CIE-'||lpad(v.consecutivo::text,6,'0'),'repetido',false);
end $$;

-- Una compra posterior al corte toma su copia confirmada, no la oferta actual
-- ni la fuente original. Los cortes anteriores siguen siendo compatibles.
-- Sin corte, se conserva la conducta anterior de preparación de compras.
create function public.fuentes_compra_pendientes_b2b(p_item_ids uuid[] default null)
returns table(pedido_item_id uuid,proveedor_id uuid,proveedor text,costo numeric,precio_tienda numeric,cierre_id uuid)
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.perfiles where id=auth.uid() and activo and rol in('gerencia','auditoria')) then
  raise exception 'Solo Administración puede consultar fuentes de compra';end if;
 return query
 select i.id,
  case when cp.cierre_id is not null then (confirmada.item->>'proveedor_id')::uuid else original.proveedor_id end,
  case when cp.cierre_id is not null then confirmada.item->>'proveedor' else proveedor_original.nombre end,
  case when cp.cierre_id is not null then (confirmada.item->>'costo')::numeric else original.costo end,
  case when cp.cierre_id is not null then (confirmada.item->>'precio')::numeric else i.precio_catalogo end,
  cp.cierre_id
 from public.pedido_b2b_items i join public.pedidos_b2b p on p.id=i.pedido_id
 left join public.b2b_cierre_pedidos cp on cp.pedido_id=p.id
 left join public.b2b_cierres c on c.id=cp.cierre_id
 left join lateral (
  select item from jsonb_array_elements(c.reporte->'items') item where item->>'item_id'=i.id::text
 ) confirmada on true
 left join public.b2b_pedido_fuente fuente on fuente.pedido_item_id=i.id
 left join public.b2b_ofertas original on original.id=fuente.oferta_id
 left join public.proveedores proveedor_original on proveedor_original.id=original.proveedor_id
 where p.estado in('solicitado','parcial','en_compra') and i.cantidad_solicitada>i.cantidad_ordenada
 and (p_item_ids is null or i.id=any(p_item_ids));
end $$;
revoke all on function public.fuentes_compra_pendientes_b2b(uuid[]) from public,anon;
grant execute on function public.fuentes_compra_pendientes_b2b(uuid[]) to authenticated,service_role;

create or replace function public.crear_orden_compra_b2b(p_proveedor_id uuid,p_items jsonb,p_nota text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_orden public.ordenes_compra%rowtype; v_item jsonb; v_linea public.pedido_b2b_items%rowtype;
 v_pedido public.pedidos_b2b%rowtype; v_fuente record; v_fuentes jsonb; v_qty numeric;
begin
 if auth.uid() is null or not exists(select 1 from public.perfiles where id=auth.uid() and activo and rol in('gerencia','auditoria')) then raise exception 'Solo Gestión o Gerencia pueden crear órdenes';end if;
 if not exists(select 1 from public.proveedores where id=p_proveedor_id and activo) then raise exception 'Proveedor inválido';end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 200 then raise exception 'La orden requiere entre 1 y 200 referencias';end if;
 perform pg_advisory_xact_lock(726041701);
 if exists(select 1 from jsonb_array_elements(p_items) i group by i->>'pedido_item_id' having count(*)>1) then raise exception 'Línea duplicada en la orden';end if;
 -- Una sola consulta, limitada a las líneas de esta orden, bajo el bloqueo.
 select coalesce(jsonb_object_agg(f.pedido_item_id,to_jsonb(f)),'{}'::jsonb) into v_fuentes
 from public.fuentes_compra_pendientes_b2b(array(
  select (i->>'pedido_item_id')::uuid from jsonb_array_elements(p_items) i
 )) f;
 insert into public.ordenes_compra(proveedor_id,nota) values(p_proveedor_id,p_nota) returning * into v_orden;
 for v_item in select * from jsonb_array_elements(p_items) loop
  select * into v_linea from public.pedido_b2b_items where id=(v_item->>'pedido_item_id')::uuid for update;
  select * into v_pedido from public.pedidos_b2b where id=v_linea.pedido_id for update;
  if v_linea.id is null or v_pedido.estado not in('solicitado','parcial','en_compra') then raise exception 'Línea no disponible';end if;
  v_qty:=(v_item->>'cantidad')::numeric;
  if v_qty is null or v_qty<1 or v_qty<>trunc(v_qty) or v_qty>v_linea.cantidad_solicitada-v_linea.cantidad_ordenada then raise exception 'La cantidad supera lo pendiente o no es válida';end if;
  if (v_item->>'costo_unitario')::numeric is null or (v_item->>'precio_tienda')::numeric is null
  or not ((v_item->>'costo_unitario')::numeric>0 and (v_item->>'costo_unitario')::numeric<1e14
  and (v_item->>'precio_tienda')::numeric>0 and (v_item->>'precio_tienda')::numeric<1e14) then raise exception 'Costo y precio inválidos';end if;
  select * into v_fuente from jsonb_to_record(v_fuentes->v_linea.id::text)
   as f(proveedor_id uuid,costo numeric,precio_tienda numeric,cierre_id uuid);
  if v_fuente.cierre_id is not null and (v_fuente.proveedor_id is null or v_fuente.costo is null or v_fuente.precio_tienda is null) then
   raise exception 'La copia confirmada del cierre no contiene la línea; revisa el cierre antes de comprar';end if;
  if v_fuente.proveedor_id is not null and v_fuente.proveedor_id<>p_proveedor_id then
   raise exception 'La línea pertenece a otro proveedor del cierre o comparativo';end if;
  if v_fuente.proveedor_id is not null and ((v_item->>'costo_unitario')::numeric<>v_fuente.costo
   or (v_item->>'precio_tienda')::numeric<>v_fuente.precio_tienda) and nullif(btrim(p_nota),'') is null then
   raise exception 'Explica en la nota el cambio de costo o precio';end if;
  insert into public.orden_compra_items(orden_id,pedido_item_id,producto_id,tienda_destino,cantidad_ordenada,costo_cotizado,precio_tienda_cotizado)
  values(v_orden.id,v_linea.id,v_linea.producto_id,v_pedido.tienda_codigo,v_qty::int,
   (v_item->>'costo_unitario')::numeric,(v_item->>'precio_tienda')::numeric);
  update public.pedido_b2b_items set cantidad_ordenada=cantidad_ordenada+v_qty::int where id=v_linea.id;
  update public.pedidos_b2b set estado=case when exists(select 1 from public.pedido_b2b_items
   where pedido_id=v_pedido.id and cantidad_ordenada<cantidad_solicitada) then 'parcial' else 'en_compra' end,updated_at=now() where id=v_pedido.id;
 end loop;
 return jsonb_build_object('orden_id',v_orden.id,'numero','OC-'||lpad(v_orden.consecutivo::text,6,'0'));
end $$;

-- CREATE OR REPLACE conserva los permisos existentes. No se cambian tablas,
-- pedidos, cierres anteriores, ofertas, existencias, caja, banco ni cartera.
notify pgrst,'reload schema';
commit;

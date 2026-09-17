begin;

-- Las listas son cotizaciones: no crean facturas, inventario, cartera ni caja.
create table public.b2b_listas_precios (
 id uuid primary key default gen_random_uuid(), archivo text not null,
 huella text not null, alcance text not null check(alcance in ('proveedores','catalogo')),
 filas jsonb not null, creado_por uuid not null references public.perfiles(id),
 creado_at timestamptz not null default now(), unique(creado_por,huella)
);
create table public.b2b_ofertas (
 id uuid primary key default gen_random_uuid(), lista_id uuid not null references public.b2b_listas_precios(id),
 producto_id uuid not null references public.productos(id), proveedor_id uuid not null references public.proveedores(id),
 costo numeric(16,2) not null check(costo>0), precio_tienda numeric(16,2) not null check(precio_tienda>0),
 motivo text, vigente boolean not null default true,
 unique(lista_id,producto_id,proveedor_id)
);
create unique index b2b_ofertas_vigentes on public.b2b_ofertas(producto_id,proveedor_id) where vigente;
create table public.b2b_pedido_fuente (
 pedido_item_id uuid primary key references public.pedido_b2b_items(id),
 oferta_id uuid not null references public.b2b_ofertas(id)
);
alter table public.pedidos_b2b add column solicitud_key uuid;
create unique index pedidos_b2b_solicitud_key on public.pedidos_b2b(creado_por,solicitud_key) where solicitud_key is not null;
alter table public.b2b_listas_precios enable row level security;
alter table public.b2b_ofertas enable row level security;
alter table public.b2b_pedido_fuente enable row level security;
revoke all on public.b2b_listas_precios,public.b2b_ofertas,public.b2b_pedido_fuente from public,anon,authenticated;
grant select on public.b2b_listas_precios,public.b2b_ofertas,public.b2b_pedido_fuente to authenticated;
create policy listas_admin on public.b2b_listas_precios for select to authenticated using (exists(select 1 from public.perfiles where id=auth.uid() and activo and rol in ('gerencia','auditoria')));
create policy ofertas_admin on public.b2b_ofertas for select to authenticated using (exists(select 1 from public.perfiles where id=auth.uid() and activo and rol in ('gerencia','auditoria')));
create policy fuentes_admin on public.b2b_pedido_fuente for select to authenticated using (exists(select 1 from public.perfiles where id=auth.uid() and activo and rol in ('gerencia','auditoria')));

-- Interna: el invocador normal sigue sujeto a RLS de las ofertas.
create view public.b2b_mejor_oferta with(security_invoker=true) as
 select distinct on(o.producto_id) o.* from public.b2b_ofertas o
 join public.productos p on p.id=o.producto_id and p.activo
 join public.proveedores pr on pr.id=o.proveedor_id and pr.activo
 where o.vigente order by o.producto_id,o.costo,o.precio_tienda,o.proveedor_id;
revoke all on public.b2b_mejor_oferta from public,anon,authenticated;
grant select on public.b2b_mejor_oferta to authenticated;

create function public.publicar_lista_b2b(p_archivo text,p_huella text,p_alcance text,p_filas jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_fila jsonb; v_costo numeric; v_precio numeric; v_motivo text;
begin
 if auth.uid() is null or not exists(select 1 from public.perfiles where id=auth.uid() and activo and rol in ('gerencia','auditoria')) then
  raise exception 'Solo Maite/Gestión o Gerencia pueden publicar listas'; end if;
 if p_alcance not in ('proveedores','catalogo') or p_alcance is null or nullif(btrim(p_archivo),'') is null or p_huella !~ '^[a-f0-9]{64}$' or p_huella is null then raise exception 'Archivo o alcance inválido'; end if;
 if jsonb_typeof(p_filas) is distinct from 'array' or jsonb_array_length(p_filas) not between 1 and 5000 then raise exception 'La lista debe contener entre 1 y 5000 filas'; end if;
 perform pg_advisory_xact_lock(726041701);
 select id into v_id from public.b2b_listas_precios where creado_por=auth.uid() and huella=p_huella;
 if v_id is not null then return jsonb_build_object('id',v_id,'repetida',true); end if;
 if exists(select 1 from jsonb_array_elements(p_filas) f group by f->>'producto_id',f->>'proveedor_id' having count(*)>1) then raise exception 'Referencia y proveedor duplicados: resuelve la diferencia antes de publicar'; end if;
 for v_fila in select * from jsonb_array_elements(p_filas) loop
  if not exists(select 1 from public.productos where id=(v_fila->>'producto_id')::uuid and activo) then raise exception 'Referencia sin vincular o inactiva'; end if;
  if not exists(select 1 from public.proveedores where id=(v_fila->>'proveedor_id')::uuid and activo) then raise exception 'Proveedor sin vincular o inactivo'; end if;
  v_costo:=(v_fila->>'costo')::numeric; v_precio:=(v_fila->>'precio_tienda')::numeric;
  if v_costo is null or v_precio is null or v_costo<=0 or v_precio<=0 or v_costo::text in ('NaN','Infinity','-Infinity') or v_precio::text in ('NaN','Infinity','-Infinity') or v_costo<>round(v_costo,2) or v_precio<>round(v_precio,2) then raise exception 'Costo real y precio a tienda deben ser valores válidos con hasta dos decimales'; end if;
  v_motivo:=nullif(btrim(v_fila->>'motivo'),'');
  if v_precio-v_costo<>20000 and v_motivo is null then raise exception 'Indica el origen o motivo del margen diferente de $20.000'; end if;
 end loop;
 insert into public.b2b_listas_precios(archivo,huella,alcance,filas,creado_por) values(p_archivo,p_huella,p_alcance,p_filas,auth.uid()) returning id into v_id;
 update public.b2b_ofertas set vigente=false where vigente and (p_alcance='catalogo' or proveedor_id in (select (f->>'proveedor_id')::uuid from jsonb_array_elements(p_filas) f));
 insert into public.b2b_ofertas(lista_id,producto_id,proveedor_id,costo,precio_tienda,motivo)
 select v_id,(f->>'producto_id')::uuid,(f->>'proveedor_id')::uuid,(f->>'costo')::numeric,(f->>'precio_tienda')::numeric,nullif(btrim(f->>'motivo'),'') from jsonb_array_elements(p_filas) f;
 return jsonb_build_object('id',v_id,'filas',jsonb_array_length(p_filas),'repetida',false);
end $$;

-- Puerta explícita para retails: proyecta solo campos comerciales seguros.
-- Nunca devuelve proveedor, costo, margen ni las filas del Excel.
create function public.catalogo_pedidos_b2b()
returns table(id uuid,codigo text,nombre text,categoria text,foto_url text,precio_guia numeric,version_precio uuid)
language plpgsql security definer stable set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo and
 (p.rol in ('gerencia','auditoria') or (p.rol in ('admin_tienda','asesor') and exists(select 1 from public.origenes o where o.codigo=p.tienda_codigo and o.activo and o.tipo='propia')))) then raise exception 'Acceso no autorizado al catálogo de pedidos'; end if;
 return query select p.id,p.codigo,p.nombre,p.categoria,p.foto_url,o.precio_tienda,o.id
 from public.b2b_mejor_oferta o join public.productos p on p.id=o.producto_id order by p.nombre,p.id;
end $$;

create function public.crear_pedido_catalogo_b2b(p_items jsonb,p_nota text,p_solicitud_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_perfil public.perfiles%rowtype; v_pedido public.pedidos_b2b%rowtype;
 v_item jsonb; v_oferta public.b2b_ofertas%rowtype; v_item_id uuid; v_qty numeric;
begin
 select * into v_perfil from public.perfiles where id=auth.uid() and activo;
 if v_perfil.id is null or v_perfil.rol not in ('admin_tienda','asesor') or not exists(select 1 from public.origenes where codigo=v_perfil.tienda_codigo and activo and tipo='propia') then raise exception 'Solo una tienda retail activa puede crear pedidos'; end if;
 if p_solicitud_key is null then raise exception 'Falta identificador del pedido'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 200 then raise exception 'Agrega entre 1 y 200 referencias'; end if;
 perform pg_advisory_xact_lock(726041701);
 select * into v_pedido from public.pedidos_b2b where creado_por=auth.uid() and solicitud_key=p_solicitud_key;
 if v_pedido.id is not null then return jsonb_build_object('pedido_id',v_pedido.id,'numero','PED-'||lpad(v_pedido.consecutivo::text,6,'0'),'repetido',true); end if;
 if exists(select 1 from jsonb_array_elements(p_items) f group by f->>'producto_id' having count(*)>1) then raise exception 'Referencia duplicada en el pedido'; end if;
 insert into public.pedidos_b2b(tienda_codigo,nota,solicitud_key) values(v_perfil.tienda_codigo,nullif(btrim(p_nota),''),p_solicitud_key) returning * into v_pedido;
 for v_item in select * from jsonb_array_elements(p_items) loop
  select * into v_oferta from public.b2b_mejor_oferta where producto_id=(v_item->>'producto_id')::uuid;
  if v_oferta.id is null then raise exception 'Referencia no publicada para pedidos'; end if;
  if (v_item->>'version_precio')::uuid is distinct from v_oferta.id or (v_item->>'precio_catalogo')::numeric is distinct from v_oferta.precio_tienda then raise exception 'La lista cambió: actualiza el catálogo y revisa los precios antes de enviar'; end if;
  v_qty:=(v_item->>'cantidad')::numeric;
  if v_qty is null or v_qty<1 or v_qty>100000 or v_qty<>trunc(v_qty) then raise exception 'Cantidad inválida'; end if;
  insert into public.pedido_b2b_items(pedido_id,producto_id,cantidad_solicitada,precio_catalogo) values(v_pedido.id,v_oferta.producto_id,v_qty::int,v_oferta.precio_tienda) returning id into v_item_id;
  insert into public.b2b_pedido_fuente(pedido_item_id,oferta_id) values(v_item_id,v_oferta.id);
 end loop;
 return jsonb_build_object('pedido_id',v_pedido.id,'numero','PED-'||lpad(v_pedido.consecutivo::text,6,'0'),'repetido',false);
end $$;
-- El endpoint anterior tampoco admite precios arbitrarios o productos no publicados.
create or replace function public.crear_pedido_b2b(p_items jsonb,p_nota text default null)
returns jsonb language sql security invoker set search_path='' as $$
 select public.crear_pedido_catalogo_b2b(p_items,p_nota,gen_random_uuid());
$$;
revoke all on function public.publicar_lista_b2b(text,text,text,jsonb),public.catalogo_pedidos_b2b(),public.crear_pedido_catalogo_b2b(jsonb,text,uuid),public.crear_pedido_b2b(jsonb,text) from public,anon;
grant execute on function public.publicar_lista_b2b(text,text,text,jsonb),public.catalogo_pedidos_b2b(),public.crear_pedido_catalogo_b2b(jsonb,text,uuid),public.crear_pedido_b2b(jsonb,text) to authenticated;
-- Reservar únicamente lo pendiente, bajo bloqueo, evita compras duplicadas
-- si Gestión procesa dos veces una solicitud o divide sus referencias.
create or replace function public.crear_orden_compra_b2b(p_proveedor_id uuid,p_items jsonb,p_nota text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_orden public.ordenes_compra%rowtype; v_item jsonb; v_linea public.pedido_b2b_items%rowtype;
 v_pedido public.pedidos_b2b%rowtype; v_oferta public.b2b_ofertas%rowtype; v_qty numeric;
begin
 if auth.uid() is null or not exists(select 1 from public.perfiles where id=auth.uid() and activo and rol in ('gerencia','auditoria')) then raise exception 'Solo Gestión o Gerencia pueden crear órdenes'; end if;
 if not exists(select 1 from public.proveedores where id=p_proveedor_id and activo) then raise exception 'Proveedor inválido'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 200 then raise exception 'La orden requiere entre 1 y 200 referencias'; end if;
 perform pg_advisory_xact_lock(726041701);
 if exists(select 1 from jsonb_array_elements(p_items) i group by i->>'pedido_item_id' having count(*)>1) then raise exception 'Línea duplicada en la orden'; end if;
 insert into public.ordenes_compra(proveedor_id,nota) values(p_proveedor_id,p_nota) returning * into v_orden;
 for v_item in select * from jsonb_array_elements(p_items) loop
  select * into v_linea from public.pedido_b2b_items where id=(v_item->>'pedido_item_id')::uuid for update;
  select * into v_pedido from public.pedidos_b2b where id=v_linea.pedido_id for update;
  if v_linea.id is null or v_pedido.estado not in ('solicitado','parcial','en_compra') then raise exception 'Línea no disponible'; end if;
  v_qty:=(v_item->>'cantidad')::numeric;
  if v_qty is null or v_qty<1 or v_qty<>trunc(v_qty) or v_qty>v_linea.cantidad_solicitada-v_linea.cantidad_ordenada then raise exception 'La cantidad supera lo pendiente o no es válida'; end if;
  if (v_item->>'costo_unitario')::numeric is null or (v_item->>'precio_tienda')::numeric is null or not ((v_item->>'costo_unitario')::numeric>0 and (v_item->>'costo_unitario')::numeric<1e14 and (v_item->>'precio_tienda')::numeric>0 and (v_item->>'precio_tienda')::numeric<1e14) then raise exception 'Costo y precio inválidos'; end if;
  select o.* into v_oferta from public.b2b_pedido_fuente f join public.b2b_ofertas o on o.id=f.oferta_id where f.pedido_item_id=v_linea.id;
  if v_oferta.id is not null and v_oferta.proveedor_id<>p_proveedor_id then raise exception 'La línea pertenece a otro proveedor del comparativo'; end if;
  if v_oferta.id is not null and ((v_item->>'costo_unitario')::numeric<>v_oferta.costo or (v_item->>'precio_tienda')::numeric<>v_linea.precio_catalogo) and nullif(btrim(p_nota),'') is null then raise exception 'Explica en la nota el cambio de costo o precio'; end if;
  insert into public.orden_compra_items(orden_id,pedido_item_id,producto_id,tienda_destino,cantidad_ordenada,costo_cotizado,precio_tienda_cotizado)
   values(v_orden.id,v_linea.id,v_linea.producto_id,v_pedido.tienda_codigo,v_qty::int,(v_item->>'costo_unitario')::numeric,(v_item->>'precio_tienda')::numeric);
  update public.pedido_b2b_items set cantidad_ordenada=cantidad_ordenada+v_qty::int where id=v_linea.id;
  update public.pedidos_b2b set estado=case when exists(select 1 from public.pedido_b2b_items where pedido_id=v_pedido.id and cantidad_ordenada<cantidad_solicitada) then 'parcial' else 'en_compra' end,updated_at=now() where id=v_pedido.id;
 end loop;
 return jsonb_build_object('orden_id',v_orden.id,'numero','OC-'||lpad(v_orden.consecutivo::text,6,'0'));
end $$;
revoke all on function public.crear_orden_compra_b2b(uuid,jsonb,text) from public,anon;
grant execute on function public.crear_orden_compra_b2b(uuid,jsonb,text) to authenticated;
commit;

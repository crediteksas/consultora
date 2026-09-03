begin;

create sequence if not exists public.pedidos_b2b_consecutivo_seq;
create sequence if not exists public.ordenes_compra_consecutivo_seq;

create table if not exists public.pedidos_b2b (
  id uuid primary key default gen_random_uuid(),
  consecutivo bigint not null default nextval('public.pedidos_b2b_consecutivo_seq'),
  tienda_codigo text not null references public.origenes(codigo),
  estado text not null default 'solicitado'
    check (estado in ('borrador','solicitado','en_compra','parcial','remisionado','cerrado','cancelado')),
  nota text,
  creado_por uuid not null default auth.uid(),
  solicitado_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (consecutivo)
);

create table if not exists public.pedido_b2b_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos_b2b(id) on delete restrict,
  producto_id uuid not null references public.productos(id),
  cantidad_solicitada integer not null check (cantidad_solicitada > 0),
  precio_catalogo numeric not null check (precio_catalogo >= 0),
  cantidad_ordenada integer not null default 0 check (cantidad_ordenada >= 0),
  cantidad_recibida integer not null default 0 check (cantidad_recibida >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.ordenes_compra (
  id uuid primary key default gen_random_uuid(),
  consecutivo bigint not null default nextval('public.ordenes_compra_consecutivo_seq'),
  proveedor_id uuid not null references public.proveedores(id),
  estado text not null default 'borrador'
    check (estado in ('borrador','enviada','recepcion_parcial','recibida','cancelada')),
  nota text,
  creada_por uuid not null default auth.uid(),
  enviada_por uuid,
  enviada_at timestamptz,
  recibida_por uuid,
  recibida_at timestamptz,
  soporte_orden_path text,
  factura_proveedor_id uuid references public.facturas_proveedor(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (consecutivo)
);

create table if not exists public.orden_compra_items (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ordenes_compra(id) on delete restrict,
  pedido_item_id uuid references public.pedido_b2b_items(id) on delete restrict,
  producto_id uuid not null references public.productos(id),
  tienda_destino text not null references public.origenes(codigo),
  cantidad_ordenada integer not null check (cantidad_ordenada > 0),
  cantidad_recibida integer not null default 0 check (cantidad_recibida >= 0),
  costo_cotizado numeric not null check (costo_cotizado >= 0),
  costo_facturado numeric check (costo_facturado >= 0),
  precio_tienda_cotizado numeric not null check (precio_tienda_cotizado >= 0),
  precio_tienda_final numeric check (precio_tienda_final >= 0),
  motivo_ajuste text,
  created_at timestamptz not null default now()
);

create table if not exists public.orden_compra_cambios (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ordenes_compra(id) on delete restrict,
  orden_item_id uuid references public.orden_compra_items(id) on delete restrict,
  campo text not null,
  valor_anterior text,
  valor_nuevo text,
  motivo text not null,
  cambiado_por uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.facturas_proveedor
  add column if not exists orden_compra_id uuid references public.ordenes_compra(id);
alter table public.remisiones
  add column if not exists orden_compra_id uuid references public.ordenes_compra(id);
create unique index if not exists remisiones_orden_tienda_uidx
  on public.remisiones(orden_compra_id, tienda_codigo)
  where orden_compra_id is not null;

alter table public.pedidos_b2b enable row level security;
alter table public.pedido_b2b_items enable row level security;
alter table public.ordenes_compra enable row level security;
alter table public.orden_compra_items enable row level security;
alter table public.orden_compra_cambios enable row level security;

revoke all on public.pedidos_b2b, public.pedido_b2b_items,
  public.ordenes_compra, public.orden_compra_items, public.orden_compra_cambios
  from public, anon;
grant select on public.pedidos_b2b, public.pedido_b2b_items,
  public.ordenes_compra, public.orden_compra_items, public.orden_compra_cambios
  to authenticated;

create policy pedidos_b2b_select on public.pedidos_b2b for select to authenticated
using (coalesce(public.es_central(), false) or tienda_codigo = (select tienda_codigo from public.perfiles where id = auth.uid() and activo = true));
create policy pedido_b2b_items_select on public.pedido_b2b_items for select to authenticated
using (exists (select 1 from public.pedidos_b2b p where p.id = pedido_id));
create policy ordenes_compra_select on public.ordenes_compra for select to authenticated
using (coalesce(public.es_central(), false));
create policy orden_compra_items_select on public.orden_compra_items for select to authenticated
using (coalesce(public.es_central(), false));
create policy orden_compra_cambios_select on public.orden_compra_cambios for select to authenticated
using (coalesce(public.es_central(), false));

create or replace function public.crear_pedido_b2b(p_items jsonb, p_nota text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_perfil public.perfiles%rowtype; v_pedido public.pedidos_b2b%rowtype; v_item jsonb;
begin
  select * into v_perfil from public.perfiles where id=auth.uid() and activo=true;
  if v_perfil.id is null or v_perfil.rol not in ('admin_tienda','asesor') or v_perfil.tienda_codigo is null then
    raise exception 'Solo una tienda activa puede crear pedidos';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Agrega productos al pedido'; end if;
  insert into public.pedidos_b2b(tienda_codigo,nota) values(v_perfil.tienda_codigo,nullif(btrim(coalesce(p_nota,'')),'')) returning * into v_pedido;
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.pedido_b2b_items(pedido_id,producto_id,cantidad_solicitada,precio_catalogo)
    select v_pedido.id,p.id,(v_item->>'cantidad')::int,coalesce((v_item->>'precio_catalogo')::numeric,p.precio_guia,0)
    from public.productos p where p.id=(v_item->>'producto_id')::uuid and p.activo=true;
    if not found then raise exception 'Producto inválido en el pedido'; end if;
  end loop;
  return jsonb_build_object('ok',true,'pedido_id',v_pedido.id,'numero','PED-'||lpad(v_pedido.consecutivo::text,6,'0'));
end $$;

create or replace function public.crear_orden_compra_b2b(p_proveedor_id uuid, p_items jsonb, p_nota text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_orden public.ordenes_compra%rowtype; v_item jsonb; v_pedido_id uuid;
begin
  if not coalesce(public.es_central(),false) then raise exception 'Solo Gestión o Gerencia pueden crear órdenes'; end if;
  if not exists(select 1 from public.proveedores where id=p_proveedor_id and activo=true) then raise exception 'Proveedor inválido'; end if;
  if p_items is null or jsonb_array_length(p_items)=0 then raise exception 'La orden no tiene productos'; end if;
  insert into public.ordenes_compra(proveedor_id,nota) values(p_proveedor_id,nullif(btrim(coalesce(p_nota,'')),'')) returning * into v_orden;
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.orden_compra_items(orden_id,pedido_item_id,producto_id,tienda_destino,cantidad_ordenada,costo_cotizado,precio_tienda_cotizado)
    select v_orden.id,pi.id,pi.producto_id,p.tienda_codigo,(v_item->>'cantidad')::int,(v_item->>'costo_unitario')::numeric,(v_item->>'precio_tienda')::numeric
    from public.pedido_b2b_items pi join public.pedidos_b2b p on p.id=pi.pedido_id
    where pi.id=(v_item->>'pedido_item_id')::uuid and p.estado in ('solicitado','parcial');
    if not found then raise exception 'Línea de pedido inválida o ya cerrada'; end if;
    update public.pedido_b2b_items set cantidad_ordenada=cantidad_ordenada+(v_item->>'cantidad')::int where id=(v_item->>'pedido_item_id')::uuid returning pedido_id into v_pedido_id;
    update public.pedidos_b2b set estado='en_compra',updated_at=now() where id=v_pedido_id;
  end loop;
  return jsonb_build_object('ok',true,'orden_id',v_orden.id,'numero','OC-'||lpad(v_orden.consecutivo::text,6,'0'));
end $$;

create or replace function public.enviar_orden_compra_b2b(p_orden_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_consecutivo bigint;
begin
  if not coalesce(public.es_central(),false) then raise exception 'Solo Gestión o Gerencia pueden enviar órdenes'; end if;
  update public.ordenes_compra set estado='enviada',enviada_por=auth.uid(),enviada_at=now(),updated_at=now()
  where id=p_orden_id and estado='borrador' returning consecutivo into v_consecutivo;
  if not found then raise exception 'La orden no está disponible para enviar'; end if;
  return jsonb_build_object('ok',true,'numero','OC-'||lpad(v_consecutivo::text,6,'0'));
end $$;

create or replace function public.confirmar_recepcion_orden_b2b(
  p_orden_id uuid, p_numero_factura text, p_fecha date, p_tipo_compra text,
  p_fecha_vencimiento date, p_fuente_fondos text, p_soporte_path text,
  p_items jsonb, p_nota text default null, p_idempotency_key uuid default gen_random_uuid()
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_orden public.ordenes_compra%rowtype; v_item jsonb; v_linea public.orden_compra_items%rowtype; v_compra_items jsonb := '[]'::jsonb; v_resultado jsonb; v_factura uuid; v_remision uuid; v_pedido uuid;
begin
  if not coalesce(public.es_central(),false) then raise exception 'Solo Gestión o Gerencia pueden recibir compras'; end if;
  if nullif(btrim(coalesce(p_soporte_path,'')),'') is null then raise exception 'La factura o soporte del proveedor es obligatorio'; end if;
  select * into v_orden from public.ordenes_compra where id=p_orden_id for update;
  if v_orden.id is null or v_orden.estado not in ('enviada','recepcion_parcial') then raise exception 'La orden no está enviada o ya fue recibida'; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_linea from public.orden_compra_items where id=(v_item->>'orden_item_id')::uuid and orden_id=p_orden_id for update;
    if v_linea.id is null then raise exception 'Línea ajena a la orden'; end if;
    if (v_item->>'cantidad_recibida')::int < 0 then raise exception 'Cantidad recibida inválida'; end if;
    if ((v_item->>'costo_facturado')::numeric <> v_linea.costo_cotizado or (v_item->>'precio_tienda_final')::numeric <> v_linea.precio_tienda_cotizado or (v_item->>'cantidad_recibida')::int <> v_linea.cantidad_ordenada)
       and nullif(btrim(coalesce(v_item->>'motivo_ajuste','')),'') is null then raise exception 'Explica la diferencia de cantidad, costo o precio'; end if;
    if (v_item->>'costo_facturado')::numeric <> v_linea.costo_cotizado then insert into public.orden_compra_cambios(orden_id,orden_item_id,campo,valor_anterior,valor_nuevo,motivo) values(p_orden_id,v_linea.id,'costo_compra',v_linea.costo_cotizado::text,v_item->>'costo_facturado',v_item->>'motivo_ajuste'); end if;
    if (v_item->>'precio_tienda_final')::numeric <> v_linea.precio_tienda_cotizado then insert into public.orden_compra_cambios(orden_id,orden_item_id,campo,valor_anterior,valor_nuevo,motivo) values(p_orden_id,v_linea.id,'precio_tienda',v_linea.precio_tienda_cotizado::text,v_item->>'precio_tienda_final',v_item->>'motivo_ajuste'); end if;
    update public.orden_compra_items set cantidad_recibida=(v_item->>'cantidad_recibida')::int,costo_facturado=(v_item->>'costo_facturado')::numeric,precio_tienda_final=(v_item->>'precio_tienda_final')::numeric,motivo_ajuste=nullif(btrim(coalesce(v_item->>'motivo_ajuste','')),'') where id=v_linea.id;
    if (v_item->>'cantidad_recibida')::int > 0 then v_compra_items := v_compra_items || jsonb_build_array(jsonb_build_object('producto_id',v_linea.producto_id,'cantidad',(v_item->>'cantidad_recibida')::int,'costo_unitario',(v_item->>'costo_facturado')::numeric,'precio_remision',(v_item->>'precio_tienda_final')::numeric)); end if;
  end loop;
  v_resultado := public.registrar_compra_proveedor_operativa(v_orden.proveedor_id,p_numero_factura,p_fecha,p_tipo_compra,p_fecha_vencimiento,p_fuente_fondos,v_compra_items,p_soporte_path,p_nota,p_idempotency_key);
  v_factura := (v_resultado->>'factura_id')::uuid;
  update public.facturas_proveedor set orden_compra_id=p_orden_id where id=v_factura;
  update public.ordenes_compra set estado='recibida',recibida_por=auth.uid(),recibida_at=now(),factura_proveedor_id=v_factura,updated_at=now() where id=p_orden_id;
  for v_linea in select * from public.orden_compra_items where orden_id=p_orden_id and cantidad_recibida>0 loop
    insert into public.remisiones(tienda_codigo,estado,nota,creada_por,orden_compra_id)
    values(v_linea.tienda_destino,'borrador','Generada desde OC-'||lpad(v_orden.consecutivo::text,6,'0'),auth.uid(),p_orden_id)
    on conflict (orden_compra_id,tienda_codigo) where orden_compra_id is not null do nothing
    returning id into v_remision;
    if v_remision is null then
      select id into v_remision from public.remisiones where orden_compra_id=p_orden_id and tienda_codigo=v_linea.tienda_destino;
    end if;
    insert into public.remision_items(remision_id,producto_id,cantidad,precio_remision,factura_proveedor_id)
    values(v_remision,v_linea.producto_id,v_linea.cantidad_recibida,coalesce(v_linea.precio_tienda_final,v_linea.precio_tienda_cotizado),v_factura);
    update public.pedido_b2b_items set cantidad_recibida=cantidad_recibida+v_linea.cantidad_recibida where id=v_linea.pedido_item_id returning pedido_id into v_pedido;
    update public.pedidos_b2b set estado='remisionado',updated_at=now() where id=v_pedido;
  end loop;
  return v_resultado || jsonb_build_object('ok',true,'orden_id',p_orden_id,'remisiones_generadas',true);
end $$;

revoke all on function public.crear_pedido_b2b(jsonb,text), public.crear_orden_compra_b2b(uuid,jsonb,text), public.enviar_orden_compra_b2b(uuid), public.confirmar_recepcion_orden_b2b(uuid,text,date,text,date,text,text,jsonb,text,uuid) from public, anon;
grant execute on function public.crear_pedido_b2b(jsonb,text), public.crear_orden_compra_b2b(uuid,jsonb,text), public.enviar_orden_compra_b2b(uuid), public.confirmar_recepcion_orden_b2b(uuid,text,date,text,date,text,text,jsonb,text,uuid) to authenticated;

commit;

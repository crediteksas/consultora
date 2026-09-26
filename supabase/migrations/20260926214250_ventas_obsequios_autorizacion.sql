begin;

-- El registro pendiente no modifica inventario, ventas ni caja. Solo al aprobar
-- se ejecuta el mismo motor transaccional de venta (incluye Addi y cierre de caja).
create table public.ventas_autorizaciones (
  id uuid primary key,
  tienda_codigo text not null,
  creado_por uuid not null references public.perfiles(id),
  creado_en timestamptz not null default now(),
  tipo text not null check(tipo in ('contado','credito')),
  cliente_id uuid,
  items jsonb not null,
  credito jsonb,
  nota text,
  detalle jsonb not null,
  total numeric not null check(total>=0),
  estado text not null check(estado in ('pendiente','aprobada','rechazada','registrada')),
  resuelto_por uuid references public.perfiles(id),
  resuelto_en timestamptz,
  motivo text,
  resultado jsonb,
  check ((estado in ('aprobada','rechazada')) = (resuelto_por is not null and resuelto_en is not null))
);
create index ventas_autorizaciones_tienda_estado on public.ventas_autorizaciones(tienda_codigo,estado,creado_en desc);
alter table public.ventas_autorizaciones enable row level security;
revoke all on public.ventas_autorizaciones from public,anon,authenticated;
grant select on public.ventas_autorizaciones to authenticated;
create policy ventas_autorizaciones_lectura on public.ventas_autorizaciones for select to authenticated
  using(public.rol_actual() is not null and (public.es_central() or tienda_codigo=public.tienda_actual()));

create or replace function public.puede_autorizar_venta_excepcional() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.perfiles where id=auth.uid() and activo
   and id in ('6de0ad26-64af-4966-8cd9-d468880af627'::uuid,'d1782db6-bacc-4caf-af6f-ce1b8d1c0391'::uuid)
   and rol in ('gerencia','auditoria'));
$$;
revoke all on function public.puede_autorizar_venta_excepcional() from public,anon;
grant execute on function public.puede_autorizar_venta_excepcional() to authenticated;

-- Copia del motor vigente, con sus validaciones y campos Addi. Es privado y
-- no puede ejecutarse directamente por REST ni por usuarios autenticados.
do $$
declare d text;
begin
 d:=pg_get_functiondef('public.registrar_venta(text,text,uuid,jsonb,jsonb,text)'::regprocedure);
 if position('if v_precio is null or v_precio <= 0 then' in d)=0 then
   raise exception 'El motor de venta cambió: revisar antes de aplicar';
 end if;
 if position('p_nota text DEFAULT NULL::text' in d)=0 or position('values (p_tienda_codigo, auth.uid(), p_tipo' in d)=0 then
   raise exception 'La firma o autoría del motor cambió'; end if;
 d:=replace(d,'p_nota text DEFAULT NULL::text','p_nota text DEFAULT NULL::text, p_vendedor uuid DEFAULT NULL::uuid');
 d:=replace(d,'values (p_tienda_codigo, auth.uid(), p_tipo','values (p_tienda_codigo, p_vendedor, p_tipo');
 d:=replace(d,'public.registrar_venta(', 'kora_private.registrar_venta_autorizada_interno(');
 d:=replace(d,'if v_precio is null or v_precio <= 0 then','if v_precio is null or v_precio < 0 then');
 execute d;
end $$;
revoke all on function kora_private.registrar_venta_autorizada_interno(text,text,uuid,jsonb,jsonb,text,uuid) from public,anon,authenticated;

create function kora_private.inspeccionar_venta_excepcional(p_tienda text,p_items jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i jsonb; p public.productos; u public.unidades; s public.stock_cantidad;
 precio numeric; cantidad numeric; costo numeric; detalle jsonb:='[]'; total numeric:=0; requiere boolean:=false;
begin
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
   raise exception 'Agrega al menos un producto'; end if;
 for i in select value from jsonb_array_elements(p_items) order by value->>'producto_id',value->>'unidad_id' loop
   select * into p from public.productos where id=(i->>'producto_id')::uuid;
   if not found then raise exception 'Producto no encontrado'; end if;
   precio:=(i->>'precio_venta')::numeric; cantidad:=(i->>'cantidad')::numeric;
   if precio is null or precio<0 or precio::text in ('NaN','Infinity','-Infinity') then
     raise exception 'El precio debe ser cero o un valor positivo'; end if;
   if cantidad is null or cantidad<=0 or cantidad<>trunc(cantidad) or cantidad::text in ('NaN','Infinity','-Infinity') then
     raise exception 'La cantidad debe ser un entero positivo'; end if;
   if p.tipo='serializado' then
     if cantidad<>1 then raise exception 'Cada IMEI requiere cantidad 1'; end if;
     if (select count(*) from jsonb_array_elements(p_items) x where x->>'unidad_id'=i->>'unidad_id')>1 then
       raise exception 'El mismo IMEI está repetido'; end if;
     select * into u from public.unidades where id=(i->>'unidad_id')::uuid for update;
     if not found or u.producto_id is distinct from p.id or u.tienda_actual is distinct from p_tienda or u.estado is distinct from 'disponible' then
       raise exception 'El IMEI no está disponible en esta tienda'; end if;
     -- Retail paga el costo de remisión, no el costo interno de compra central.
     costo:=u.precio_tienda;
   else
     if nullif(i->>'unidad_id','') is not null then raise exception 'Un accesorio no lleva IMEI'; end if;
     select * into s from public.stock_cantidad where producto_id=p.id and tienda_codigo=p_tienda for update;
     if not found or s.cantidad < (select sum((x->>'cantidad')::numeric) from jsonb_array_elements(p_items) x where x->>'producto_id'=p.id::text) then
       raise exception 'Stock insuficiente para %',p.nombre; end if;
     costo:=s.costo_promedio;
   end if;
   if costo is null or costo<=0 or costo::text in ('NaN','Infinity','-Infinity') then
     raise exception 'Falta el costo de remisión de %',p.nombre; end if;
   requiere:=requiere or precio=0 or precio<costo;
   total:=total+precio*cantidad;
   detalle:=detalle||jsonb_build_array(jsonb_build_object('producto_id',p.id,'nombre',p.nombre,
     'unidad_id',i->>'unidad_id','imei',case when p.tipo='serializado' then u.imei else null end,
     'cantidad',cantidad,'precio_venta',precio,'costo_unitario',costo,'requiere_autorizacion',precio=0 or precio<costo));
 end loop;
 return jsonb_build_object('detalle',detalle,'total',total,'requiere_autorizacion',requiere);
end $$;
revoke all on function kora_private.inspeccionar_venta_excepcional(text,jsonb) from public,anon,authenticated;

create function public.registrar_venta_con_autorizacion(
 p_solicitud_id uuid,p_tienda_codigo text,p_tipo text,p_cliente_id uuid,p_items jsonb,p_credito jsonb,p_nota text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.ventas_autorizaciones; revision jsonb; resultado jsonb;
begin
 if auth.uid() is null or public.rol_actual() is null or not coalesce(public.es_central() or public.tienda_actual()=p_tienda_codigo,false) then
   raise exception 'No autorizado para vender en esta tienda'; end if;
 if p_solicitud_id is null then raise exception 'Falta el identificador de la solicitud'; end if;
 if p_tipo is null or p_tipo not in ('contado','credito') then raise exception 'Tipo de venta inválido'; end if;
 if p_tipo='credito' and (p_cliente_id is null or p_credito is null) then raise exception 'Faltan los datos del cliente o crédito'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_solicitud_id::text,0));
 select * into r from public.ventas_autorizaciones where id=p_solicitud_id for update;
 if found then
   if r.creado_por<>auth.uid() or r.tienda_codigo<>p_tienda_codigo or r.tipo<>p_tipo
      or r.cliente_id is distinct from p_cliente_id or r.items is distinct from p_items
      or r.credito is distinct from p_credito or r.nota is distinct from p_nota then
     raise exception 'La solicitud ya existe con otros datos'; end if;
   return r.resultado;
 end if;
 revision:=kora_private.inspeccionar_venta_excepcional(p_tienda_codigo,p_items);
 if (revision->>'requiere_autorizacion')::boolean then
   resultado:=jsonb_build_object('ok',true,'estado','pendiente','solicitud_id',p_solicitud_id,'total',revision->'total');
 else
   resultado:=kora_private.registrar_venta_autorizada_interno(p_tienda_codigo,p_tipo,p_cliente_id,p_items,p_credito,p_nota,auth.uid())
     ||jsonb_build_object('estado','registrada','solicitud_id',p_solicitud_id);
 end if;
 insert into public.ventas_autorizaciones(id,tienda_codigo,creado_por,tipo,cliente_id,items,credito,nota,detalle,total,estado,resultado)
 values(p_solicitud_id,p_tienda_codigo,auth.uid(),p_tipo,p_cliente_id,p_items,p_credito,p_nota,
   revision->'detalle',(revision->>'total')::numeric,resultado->>'estado',resultado);
 return resultado;
end $$;
revoke all on function public.registrar_venta_con_autorizacion(uuid,text,text,uuid,jsonb,jsonb,text) from public,anon;
grant execute on function public.registrar_venta_con_autorizacion(uuid,text,text,uuid,jsonb,jsonb,text) to authenticated;

-- Los clientes antiguos tampoco pueden saltarse el control de autorización.
create or replace function public.registrar_venta(p_tienda_codigo text,p_tipo text,p_cliente_id uuid,p_items jsonb,p_credito jsonb,p_nota text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 return public.registrar_venta_con_autorizacion(gen_random_uuid(),p_tienda_codigo,p_tipo,p_cliente_id,p_items,p_credito,p_nota);
end $$;
revoke all on function public.registrar_venta(text,text,uuid,jsonb,jsonb,text) from public,anon;
grant execute on function public.registrar_venta(text,text,uuid,jsonb,jsonb,text) to authenticated;

create function public.resolver_autorizacion_venta(p_id uuid,p_aprobar boolean,p_motivo text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
<<resolucion>>
declare r public.ventas_autorizaciones; revision jsonb; resultado jsonb;
begin
 if not public.puede_autorizar_venta_excepcional() then raise exception 'Solo Mayte u Óscar pueden autorizar este movimiento'; end if;
 if p_aprobar is null then raise exception 'Selecciona aprobar o rechazar'; end if;
 select * into r from public.ventas_autorizaciones where id=p_id for update;
 if not found then raise exception 'Solicitud no encontrada'; end if;
 if r.estado<>'pendiente' then return r.resultado; end if;
 if not p_aprobar and nullif(btrim(p_motivo),'') is null then raise exception 'Indica el motivo del rechazo'; end if;
 if p_aprobar then
   revision:=kora_private.inspeccionar_venta_excepcional(r.tienda_codigo,r.items);
   if revision->'detalle' is distinct from r.detalle then
     raise exception 'El costo o detalle cambió. Rechaza esta solicitud y carga una nueva para revisar los valores actuales'; end if;
   resultado:=kora_private.registrar_venta_autorizada_interno(r.tienda_codigo,r.tipo,r.cliente_id,r.items,r.credito,r.nota,r.creado_por);
   resultado:=resultado||jsonb_build_object('estado','aprobada','solicitud_id',r.id);
 else
   resultado:=jsonb_build_object('ok',true,'estado','rechazada','solicitud_id',r.id,'total',r.total);
 end if;
 update public.ventas_autorizaciones set estado=resolucion.resultado->>'estado',resuelto_por=auth.uid(),resuelto_en=now(),
   motivo=nullif(btrim(p_motivo),''),resultado=resolucion.resultado where id=r.id;
 return resultado;
end $$;
revoke all on function public.resolver_autorizacion_venta(uuid,boolean,text) from public,anon;
grant execute on function public.resolver_autorizacion_venta(uuid,boolean,text) to authenticated;

notify pgrst,'reload schema';
commit;

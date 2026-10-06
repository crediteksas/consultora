-- Separate unsellable goods from unexplained inventory shortages. Neither a
-- request nor a count upload changes stock; Mayte/Oscar authorize the exit.
begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('inventario-no-conformes','inventario-no-conformes',false,10485760,
 array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create function inventario_control.puede_ver_foto_no_conforme(p_tienda text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo
   and (p.rol in ('gerencia','auditoria') or
     (p.rol='admin_tienda' and (p.tienda_codigo=p_tienda or exists(
       select 1 from public.sesiones_conteo_cruzado s where s.admin_autorizado=p.id
         and s.tienda_auditada=p_tienda and s.estado='abierta'
         and s.vigencia_hasta>clock_timestamp())))))
$$;
revoke all on function inventario_control.puede_ver_foto_no_conforme(text) from public,anon;
grant execute on function inventario_control.puede_ver_foto_no_conforme(text) to authenticated;
create policy inventario_nc_foto_insert on storage.objects for insert to authenticated
with check (bucket_id='inventario-no-conformes'
 and name ~ '^CK-[0-9]+/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
 and owner_id=auth.uid()::text
 and inventario_control.puede_ver_foto_no_conforme((storage.foldername(name))[1]));
create policy inventario_nc_foto_select on storage.objects for select to authenticated
using (bucket_id='inventario-no-conformes'
 and inventario_control.puede_ver_foto_no_conforme((storage.foldername(name))[1]));

alter table public.unidades drop constraint unidades_estado_check;
alter table public.unidades add constraint unidades_estado_check check
 (estado = any(array['en_oscar','disponible','vendido','en_traslado',
   'garantia_proveedor','anulado_reingreso','salida_b2b','no_conforme']));

create table inventario_control.no_conformes (
 id uuid primary key default gen_random_uuid(),
 tienda_codigo text not null references public.origenes(codigo),
 producto_id uuid not null references public.productos(id),
 imei text not null default '',
 cantidad integer not null check (cantidad>0),
 costo_tienda numeric,
 categoria_gasto text not null default 'producto_deteriorado' check
   (categoria_gasto in ('producto_deteriorado','imperfecto','garantia')),
 foto_path text not null,
 motivo text not null check (length(btrim(motivo))>=5),
 soporte text not null check (length(btrim(soporte))>=5),
 corte_id uuid references inventario_control.cortes(id),
 estado text not null default 'solicitado' check
   (estado in ('solicitado','separado_pendiente_destino','rechazado')),
 creado_por uuid not null references public.perfiles(id),
 creado_at timestamptz not null default clock_timestamp(),
 autorizado_por uuid references public.perfiles(id),
 autorizado_at timestamptz,
 rechazo_motivo text,
 movimiento_id bigint unique references public.movimientos(id),
 constraint no_conforme_aplicado_completo check (
   (estado='separado_pendiente_destino' and autorizado_por is not null
     and autorizado_at is not null and movimiento_id is not null and costo_tienda>0)
   or (estado<>'separado_pendiente_destino' and movimiento_id is null))
);
create unique index no_conforme_por_linea_corte on inventario_control.no_conformes
 (corte_id,producto_id,imei) where corte_id is not null;
create index no_conformes_pendientes on inventario_control.no_conformes(estado,tienda_codigo);
alter table inventario_control.no_conformes enable row level security;
revoke all on inventario_control.no_conformes from public,anon,authenticated;

create table inventario_control.linea_decisiones (
 corte_id uuid not null,
 producto_id uuid not null,
 imei text not null,
 clasificacion text not null check
   (clasificacion in ('no_conforme','faltante','obsequio','correccion_registro','sobrante')),
 cantidad integer not null check (cantidad>0),
 decidido_por uuid not null references public.perfiles(id),
 decidido_at timestamptz not null default clock_timestamp(),
 primary key (corte_id,producto_id,imei),
 foreign key (corte_id,producto_id,imei)
   references inventario_control.lineas(corte_id,producto_id,imei)
);
alter table inventario_control.linea_decisiones enable row level security;
revoke all on inventario_control.linea_decisiones from public,anon,authenticated;

-- A stale page cannot apply every discrepancy as one generic shortage.
create function inventario_control.exigir_decisiones() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.estado in ('aplicado','sin_diferencias') and old.estado is distinct from new.estado
   and exists (
     select 1 from inventario_control.lineas l
     where l.corte_id=new.id and coalesce(l.diferencia,0)<>0
       and not exists (select 1 from inventario_control.linea_decisiones d
         where d.corte_id=l.corte_id and d.producto_id=l.producto_id and d.imei=l.imei
           and d.cantidad=abs(l.diferencia)
           and (case when l.diferencia>0 then d.clasificacion in ('sobrante','correccion_registro')
             else d.clasificacion in ('no_conforme','faltante','obsequio','correccion_registro') end))
   ) then
   raise exception 'Clasifica cada diferencia antes de autorizar el inventario';
 end if;
 return new;
end $$;
revoke all on function inventario_control.exigir_decisiones() from public,anon,authenticated;
create trigger exigir_decisiones_antes_de_aplicar before update of estado
 on inventario_control.cortes for each row execute function inventario_control.exigir_decisiones();

-- The existing API remains the one atomic count applier. Only its immutable
-- movement INSERT is specialized for lines explicitly classified as defective.
do $$
declare def text; needle text; replacement text;
begin
 def:=pg_get_functiondef('inventario_control.api(text,jsonb)'::regprocedure);
 needle:=$n$'conteo_inventario',v_id::text,v_perfil.id,concat_ws(' · ',p_datos->>'motivo',p_datos->>'clasificacion',p_datos->>'soporte')$n$;
 replacement:=$n$case when exists(select 1 from inventario_control.no_conformes n
               where n.corte_id=v_id and n.producto_id=v_linea.producto_id and n.imei=v_linea.imei)
               then 'salida_no_conforme' else 'conteo_inventario' end,
             coalesce((select n.id::text from inventario_control.no_conformes n
               where n.corte_id=v_id and n.producto_id=v_linea.producto_id and n.imei=v_linea.imei),v_id::text),
             v_perfil.id,concat_ws(' · ',p_datos->>'motivo',p_datos->>'clasificacion',p_datos->>'soporte',
               (select 'NO CONFORME: '||n.motivo from inventario_control.no_conformes n
                where n.corte_id=v_id and n.producto_id=v_linea.producto_id and n.imei=v_linea.imei))$n$;
 if strpos(def,needle)=0 or strpos(substr(def,strpos(def,needle)+length(needle)),needle)>0 then
   raise exception 'Cambió la función de conteos; revisar antes de modificarla';
 end if;
 def:=replace(def,needle,replacement);
 needle:=$n$update public.unidades set estado='anulado_reingreso' where id=v_unidad.id;$n$;
 replacement:=$n$update public.unidades set estado=case when exists(
             select 1 from inventario_control.no_conformes n where n.corte_id=v_id
               and n.producto_id=v_linea.producto_id and n.imei=v_linea.imei)
             then 'no_conforme' else 'anulado_reingreso' end where id=v_unidad.id;$n$;
 if strpos(def,needle)=0 then raise exception 'Cambió la salida de equipos del conteo'; end if;
 def:=replace(def,needle,replacement);
 needle:=$n$if p_accion='crear' then
   v_tienda:=p_datos->>'tienda';$n$;
 replacement:=$n$if p_accion='crear' then
   v_tienda:=p_datos->>'tienda';
   perform pg_advisory_xact_lock(hashtextextended('no-conforme-corte:'||coalesce(v_tienda,''),0));
   if exists(select 1 from inventario_control.no_conformes n
     where n.tienda_codigo=v_tienda and n.estado='solicitado' and n.corte_id is null) then
     raise exception 'Resuelve las solicitudes de no conformes antes de iniciar el corte'; end if;$n$;
 if strpos(def,needle)=0 then raise exception 'Cambió la creación del corte'; end if;
 def:=replace(def,needle,replacement);
 needle:=$n$'correccion_registro','faltante','sobrante_por_aclarar','mixto'$n$;
 if strpos(def,needle)=0 then raise exception 'Cambió la clasificación de conteos'; end if;
 execute replace(def,needle,$n$'correccion_registro','faltante','sobrante_por_aclarar','mixto','no_conforme'$n$);
end $$;
alter table inventario_control.cortes drop constraint cortes_clasificacion_check;
alter table inventario_control.cortes add constraint cortes_clasificacion_check
 check (clasificacion in ('correccion_registro','faltante','sobrante_por_aclarar','mixto','no_conforme'));

create or replace function inventario_control.costo_movimiento() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.referencia_tipo='conteo_inventario' and new.tipo in ('ajuste_entrada','ajuste_salida') then
   select l.costo_tienda into new.costo_tienda from inventario_control.lineas l
   where l.corte_id::text=new.referencia_id and l.producto_id=new.producto_id
   and l.imei=coalesce((select imei from public.unidades where id=new.unidad_id),'');
 elsif new.referencia_tipo='salida_no_conforme' and new.tipo='ajuste_salida' then
   select n.costo_tienda into new.costo_tienda from inventario_control.no_conformes n
   where n.id::text=new.referencia_id and n.producto_id=new.producto_id;
 end if;
 if new.referencia_tipo in ('conteo_inventario','salida_no_conforme') then
   new.costo_tienda:=coalesce(new.costo_tienda,new.costo);
 end if;
 return new;
end $$;

create function inventario_control.no_conformes_api(p_accion text,p_datos jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare p public.perfiles%rowtype; n inventario_control.no_conformes%rowtype;
 c inventario_control.cortes%rowtype; l inventario_control.lineas%rowtype;
 u public.unidades%rowtype; d jsonb; rows jsonb; row jsonb;
 authoriza boolean; central boolean; store text; product uuid; serial text;
 qty integer; current_qty integer; cost numeric; mov bigint; prev text; result jsonb;
begin
 select * into p from public.perfiles where id=auth.uid() and activo;
 if not found then raise exception 'Sesión sin perfil activo'; end if;
 central:=p.rol in ('gerencia','auditoria');
 authoriza:=central and exists(select 1 from inventario_control.responsables where perfil_id=p.id);
 if p_accion='listar' then
   return jsonb_build_object('registros',(
     select coalesce(jsonb_agg(to_jsonb(x) order by x.creado_at desc),'[]'::jsonb)
     from (select n.*,pr.codigo,pr.nombre producto_nombre,o.nombre tienda_nombre
       from inventario_control.no_conformes n
       join public.productos pr on pr.id=n.producto_id
       join public.origenes o on o.codigo=n.tienda_codigo
       where (central or n.tienda_codigo=p.tienda_codigo or exists(
         select 1 from public.sesiones_conteo_cruzado s where s.admin_autorizado=p.id
           and s.tienda_auditada=n.tienda_codigo and s.estado='abierta'
           and s.vigencia_hasta>clock_timestamp()))
       order by n.creado_at desc limit 100) x));
 end if;
 if p_accion='resumen' then
   if coalesce(p_datos->>'anio','') !~ '^20[0-9]{2}$' then raise exception 'Año inválido'; end if;
   store:=nullif(p_datos->>'tienda','');
   if not central and store is distinct from p.tienda_codigo and not exists(
     select 1 from public.sesiones_conteo_cruzado s where s.admin_autorizado=p.id
       and s.tienda_auditada=store and s.estado='abierta' and s.vigencia_hasta>clock_timestamp())
     then raise exception 'No puedes consultar otra tienda'; end if;
   return jsonb_build_object('anio',(p_datos->>'anio')::integer,'filas',(
     select coalesce(jsonb_agg(to_jsonb(x) order by x.tienda_codigo,x.categoria_gasto),'[]'::jsonb)
     from (select n.tienda_codigo,n.categoria_gasto,sum(n.cantidad)::integer unidades,
       sum(n.cantidad*n.costo_tienda) gasto_no_monetario
       from inventario_control.no_conformes n
       left join inventario_control.cortes c on c.id=n.corte_id
       where n.estado='separado_pendiente_destino'
         and extract(year from coalesce(c.corte_at,n.autorizado_at) at time zone 'America/Bogota')=(p_datos->>'anio')::integer
         and (store is null or n.tienda_codigo=store)
         and (central or n.tienda_codigo=p.tienda_codigo or exists(
           select 1 from public.sesiones_conteo_cruzado s where s.admin_autorizado=p.id
             and s.tienda_auditada=n.tienda_codigo and s.estado='abierta'
             and s.vigencia_hasta>clock_timestamp()))
       group by n.tienda_codigo,n.categoria_gasto) x));
 end if;
 if p_accion='solicitar' then
   store:=nullif(btrim(p_datos->>'tienda'),'');
   if not central and (p.rol<>'admin_tienda' or (store is distinct from p.tienda_codigo
     and not exists(select 1 from public.sesiones_conteo_cruzado s where s.admin_autorizado=p.id
       and s.tienda_auditada=store and s.estado='abierta' and s.vigencia_hasta>clock_timestamp()))) then
     raise exception 'Solo la tienda o Auditoría pueden registrar sus no conformes'; end if;
   if not exists(select 1 from public.origenes where codigo=store and activo and tipo='propia') then
     raise exception 'Selecciona una tienda activa'; end if;
   select id into product from public.productos where codigo=p_datos->>'codigo';
   if product is null then raise exception 'Referencia no encontrada'; end if;
   if coalesce(p_datos->>'cantidad','') !~ '^[1-9][0-9]*$' then raise exception 'Cantidad inválida'; end if;
   qty:=(p_datos->>'cantidad')::integer; serial:=btrim(coalesce(p_datos->>'imei',''));
   if (select tipo='serializado' from public.productos where id=product) is distinct from (serial<>'')
     or (serial<>'' and qty<>1) then raise exception 'Equipos: IMEI y una unidad; accesorios: sin IMEI'; end if;
   if length(btrim(coalesce(p_datos->>'motivo','')))<5 or length(btrim(coalesce(p_datos->>'soporte','')))<5 then
     raise exception 'Documenta motivo y soporte (mínimo 5 caracteres cada uno)'; end if;
   if coalesce(p_datos->>'categoria_gasto','') not in ('producto_deteriorado','imperfecto','garantia') then
     raise exception 'Selecciona la categoría del gasto de inventario'; end if;
   if coalesce(p_datos->>'foto_path','') !~ ('^'||store||'/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
      or not exists(select 1 from storage.objects o where o.bucket_id='inventario-no-conformes'
        and o.name=p_datos->>'foto_path' and o.owner_id=p.id::text) then
      raise exception 'Adjunta una foto propia y válida antes de solicitar la salida'; end if;
   perform pg_advisory_xact_lock(hashtextextended('no-conforme-corte:'||store,0));
   if nullif(p_datos->>'corte_id','') is not null then
     select * into c from inventario_control.cortes where id=(p_datos->>'corte_id')::uuid for update;
     if not found or c.tienda_codigo<>store or c.estado<>'pendiente' then
       raise exception 'Selecciona un corte pendiente de esta tienda'; end if;
     select * into l from inventario_control.lineas where corte_id=c.id and producto_id=product and imei=serial;
     if not found or l.diferencia is null or l.diferencia>=0 or -l.diferencia<>qty then
       raise exception 'La cantidad no conforme debe coincidir con la diferencia negativa de esa referencia'; end if;
   elsif exists(select 1 from inventario_control.cortes where tienda_codigo=store
     and estado in ('abierto','pendiente')) then
     raise exception 'Ya hay un corte abierto: vincula la foto a la diferencia de ese corte'; end if;
   insert into inventario_control.no_conformes(tienda_codigo,producto_id,imei,cantidad,categoria_gasto,
     foto_path,motivo,soporte,corte_id,creado_por)
   values(store,product,serial,qty,p_datos->>'categoria_gasto',p_datos->>'foto_path',
     btrim(p_datos->>'motivo'),btrim(p_datos->>'soporte'),c.id,p.id)
   returning * into n;
   return jsonb_build_object('id',n.id,'estado',n.estado,'stock_modificado',false);
 end if;
 if p_accion in ('autorizar','rechazar') then
   if not authoriza then raise exception 'Solo Mayte u Óscar pueden decidir esta salida'; end if;
   select * into n from inventario_control.no_conformes where id=(p_datos->>'id')::uuid for update;
   if not found or n.estado<>'solicitado' then raise exception 'Solicitud no encontrada o ya decidida'; end if;
   if p_accion='rechazar' then
     if length(btrim(coalesce(p_datos->>'motivo','')))<5 then raise exception 'Explica el rechazo'; end if;
     update inventario_control.no_conformes set estado='rechazado',rechazo_motivo=btrim(p_datos->>'motivo'),
       autorizado_por=p.id,autorizado_at=clock_timestamp() where id=n.id;
     return jsonb_build_object('id',n.id,'estado','rechazado','stock_modificado',false);
   end if;
   if n.corte_id is not null then
     raise exception 'Este imperfecto pertenece a un corte; se autoriza al aplicar ese corte'; end if;
   perform pg_advisory_xact_lock(hashtextextended('no-conforme-corte:'||n.tienda_codigo,0));
   if exists(select 1 from inventario_control.cortes where tienda_codigo=n.tienda_codigo
     and estado in ('abierto','pendiente')) then
     raise exception 'La tienda tiene un corte abierto: clasifica el no conforme dentro de ese corte; no hagas otra salida'; end if;
   lock table public.stock_cantidad,public.unidades in share row exclusive mode;
   prev:=current_setting('kora.conteo_ajuste',true);
   perform set_config('kora.conteo_ajuste','si',true);
   if n.imei='' then
     select cantidad,precio_tienda into current_qty,cost from public.stock_cantidad
       where tienda_codigo=n.tienda_codigo and producto_id=n.producto_id for update;
     if coalesce(current_qty,0)<n.cantidad then raise exception 'Existencia vendible insuficiente'; end if;
     if cost is null or cost<=0 then raise exception 'Falta costo de tienda verificable'; end if;
     update public.stock_cantidad set cantidad=cantidad-n.cantidad,updated_at=clock_timestamp()
       where tienda_codigo=n.tienda_codigo and producto_id=n.producto_id;
   else
     select * into u from public.unidades where producto_id=n.producto_id and imei=n.imei for update;
     if not found or u.tienda_actual<>n.tienda_codigo or u.estado<>'disponible' then
       raise exception 'El equipo ya no está disponible en esta tienda'; end if;
     cost:=u.precio_tienda;
     if cost is null or cost<=0 then raise exception 'Falta costo de tienda verificable'; end if;
     update public.unidades set estado='no_conforme' where id=u.id;
   end if;
   update inventario_control.no_conformes set costo_tienda=cost where id=n.id;
   insert into public.movimientos(tipo,tienda_codigo,producto_id,unidad_id,cantidad,costo,
     referencia_tipo,referencia_id,usuario,nota)
   values('ajuste_salida',n.tienda_codigo,n.producto_id,case when n.imei<>'' then u.id end,
     n.cantidad,cost,'salida_no_conforme',n.id::text,p.id,
     'Retirado del inventario vendible; destino pendiente. '||n.motivo||' · '||n.soporte)
   returning id into mov;
   perform set_config('kora.conteo_ajuste',coalesce(prev,''),true);
   update inventario_control.no_conformes set estado='separado_pendiente_destino',
     autorizado_por=p.id,autorizado_at=clock_timestamp(),movimiento_id=mov where id=n.id;
   return jsonb_build_object('id',n.id,'estado','separado_pendiente_destino',
     'valor',n.cantidad*cost,'movimiento_id',mov,'stock_modificado',true);
 end if;
 if p_accion='aplicar_conteo' then
   if not authoriza then raise exception 'Solo Mayte u Óscar pueden autorizar el conteo'; end if;
   select * into c from inventario_control.cortes where id=(p_datos->>'id')::uuid for update;
   if not found or c.estado<>'pendiente' or c.base_conteo<>'corte_fijo' then
     raise exception 'El corte no está pendiente con base fija'; end if;
   rows:=p_datos->'decisiones';
   if jsonb_typeof(rows) is distinct from 'array' then raise exception 'Clasifica cada diferencia'; end if;
   if jsonb_array_length(rows)<>(select count(*) from inventario_control.lineas
     where corte_id=c.id and coalesce(diferencia,0)<>0) then raise exception 'Faltan decisiones o hay filas repetidas'; end if;
   if exists(select 1 from jsonb_array_elements(rows) x
     group by x->>'codigo',coalesce(x->>'imei','') having count(*)>1) then
     raise exception 'Decisión duplicada'; end if;
   for row in select value from jsonb_array_elements(rows) loop
     select * into l from inventario_control.lineas where corte_id=c.id
       and codigo=row->>'codigo' and imei=coalesce(row->>'imei','');
     if not found or coalesce(l.diferencia,0)=0 then raise exception 'Decisión ajena al corte'; end if;
     if row->>'clasificacion' not in ('no_conforme','faltante','obsequio','correccion_registro','sobrante')
       or (l.diferencia>0 and row->>'clasificacion' not in ('sobrante','correccion_registro'))
       or (l.diferencia<0 and row->>'clasificacion'='sobrante') then
       raise exception 'Clasificación inválida para %',l.codigo; end if;
     insert into inventario_control.linea_decisiones(corte_id,producto_id,imei,clasificacion,cantidad,decidido_por)
     values(c.id,l.producto_id,l.imei,row->>'clasificacion',abs(l.diferencia),p.id);
     if row->>'clasificacion'='no_conforme' then
       if l.costo_tienda is null or l.costo_tienda<=0 then
         raise exception 'Falta costo del no conforme %',l.codigo; end if;
       select * into n from inventario_control.no_conformes
         where corte_id=c.id and producto_id=l.producto_id and imei=l.imei and estado='solicitado'
         for update;
       if not found or n.cantidad<>abs(l.diferencia) or not exists(
         select 1 from storage.objects o where o.bucket_id='inventario-no-conformes'
           and o.name=n.foto_path) then
         raise exception 'Falta solicitud con foto para el no conforme %',l.codigo; end if;
       update inventario_control.no_conformes set costo_tienda=l.costo_tienda where id=n.id;
     end if;
   end loop;
   result:=inventario_control.api('aplicar',p_datos);
   update inventario_control.no_conformes target set
     movimiento_id=m.id,estado='separado_pendiente_destino',autorizado_por=p.id,autorizado_at=clock_timestamp()
   from public.movimientos m where target.corte_id=c.id and m.referencia_tipo='salida_no_conforme'
     and m.referencia_id=target.id::text;
   if exists(select 1 from inventario_control.no_conformes where corte_id=c.id
     and (estado<>'separado_pendiente_destino' or movimiento_id is null)) then
     raise exception 'No se vinculó la salida no conforme; se revierte el ajuste completo'; end if;
   return result;
 end if;
 raise exception 'Acción de no conformes desconocida';
end $$;
revoke all on function inventario_control.no_conformes_api(text,jsonb) from public,anon;
grant execute on function inventario_control.no_conformes_api(text,jsonb) to authenticated;
create function public.inventario_no_conformes(p_accion text,p_datos jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path=''
as $$ select inventario_control.no_conformes_api(p_accion,p_datos); $$;
revoke all on function public.inventario_no_conformes(text,jsonb) from public,anon;
grant execute on function public.inventario_no_conformes(text,jsonb) to authenticated;

-- This is an inventory expense, not a cash-register expense. Its movement ID
-- is unique, so reporting cannot charge the same write-off twice.
create function inventario_control.gastos_no_monetarios(p_desde date,p_hasta date,p_tienda text default null)
returns table(id uuid,fecha date,tienda_codigo text,categoria_gasto text,
  producto_id uuid,cantidad integer,valor numeric,movimiento_id bigint)
language plpgsql security definer set search_path='' as $$
declare p public.perfiles%rowtype;
begin
 select * into p from public.perfiles where public.perfiles.id=auth.uid() and activo;
 if not found then raise exception 'Sesión sin perfil activo'; end if;
 if p_desde is null or p_hasta is null or p_desde>p_hasta
   or p_hasta-p_desde>366 then raise exception 'Rango de gastos inválido'; end if;
 if p.rol not in ('gerencia','auditoria') and
   (p.rol<>'admin_tienda' or p_tienda is distinct from p.tienda_codigo) then
   raise exception 'No puedes consultar gastos de otra tienda'; end if;
 return query select n.id,(coalesce(c.corte_at,n.autorizado_at) at time zone 'America/Bogota')::date,
   n.tienda_codigo,n.categoria_gasto,n.producto_id,n.cantidad,
   n.cantidad*n.costo_tienda,n.movimiento_id
 from inventario_control.no_conformes n
 left join inventario_control.cortes c on c.id=n.corte_id
 where n.estado='separado_pendiente_destino'
   and (coalesce(c.corte_at,n.autorizado_at) at time zone 'America/Bogota')::date between p_desde and p_hasta
   and (p_tienda is null or n.tienda_codigo=p_tienda)
   and (p.rol in ('gerencia','auditoria') or n.tienda_codigo=p.tienda_codigo)
 order by coalesce(c.corte_at,n.autorizado_at),n.id;
end $$;
revoke all on function inventario_control.gastos_no_monetarios(date,date,text) from public,anon;
grant execute on function inventario_control.gastos_no_monetarios(date,date,text) to authenticated;
create function public.gastos_inventario_no_monetarios(p_desde date,p_hasta date,p_tienda text default null)
returns table(id uuid,fecha date,tienda_codigo text,categoria_gasto text,
  producto_id uuid,cantidad integer,valor numeric,movimiento_id bigint)
language sql security invoker set search_path='' as $$
  select * from inventario_control.gastos_no_monetarios(p_desde,p_hasta,p_tienda);
$$;
revoke all on function public.gastos_inventario_no_monetarios(date,date,text) from public,anon;
grant execute on function public.gastos_inventario_no_monetarios(date,date,text) to authenticated;
notify pgrst,'reload schema';
commit;

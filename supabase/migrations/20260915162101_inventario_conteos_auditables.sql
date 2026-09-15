-- Conteos: fotografías persistentes, observación física separada de aplicación.
-- No modifica inventarios, cartera, pagos ni utilidades existentes.
begin;
create schema if not exists inventario_control;
revoke all on schema inventario_control from public, anon;
grant usage on schema inventario_control to authenticated;
create table inventario_control.respaldo_rpc as
 select oid::regprocedure::text as firma,pg_get_functiondef(oid) as definicion
 from pg_proc where pronamespace='public'::regnamespace
 and proname in ('inventario_registrar_ajuste','autorizar_ajuste','generar_ajustes_conteo');
alter table inventario_control.respaldo_rpc enable row level security;

create table inventario_control.responsables (
  perfil_id uuid primary key references public.perfiles(id)
);
insert into inventario_control.responsables values
 ('6de0ad26-64af-4966-8cd9-d468880af627'), -- Óscar; identidad comprobada
 ('d1782db6-bacc-4caf-af6f-ce1b8d1c0391'); -- Maite; identidad comprobada

create table inventario_control.cortes (
  id uuid primary key default gen_random_uuid(),
  tienda_codigo text not null references public.origenes(codigo),
  tienda_nombre text not null,
  corte_at timestamptz not null,
  creado_por uuid not null references public.perfiles(id),
  creado_nombre text not null,
  estado text not null default 'abierto' check (estado in ('abierto','pendiente','aplicado','sin_diferencias','rechazado')),
  contado_at timestamptz,
  recibido_at timestamptz,
  contado_por uuid references public.perfiles(id),
  contado_nombre text,
  archivo_nombre text,
  archivo_sha256 text,
  autorizado_at timestamptz,
  autorizado_por uuid references public.perfiles(id),
  autorizado_nombre text,
  motivo text,
  soporte text,
  clasificacion text check (clasificacion in ('correccion_registro','faltante','sobrante_por_aclarar','mixto'))
);
create index on inventario_control.cortes (corte_at,id);
create index on inventario_control.cortes (tienda_codigo,corte_at);
create table inventario_control.lineas (
  corte_id uuid not null references inventario_control.cortes(id),
  producto_id uuid not null references public.productos(id),
  imei text not null default '',
  codigo text not null,
  nombre text not null,
  tipo text not null check (tipo in ('cantidad','serializado')),
  cantidad_corte integer not null,
  costo_tienda numeric,
  cantidad_fisica integer,
  esperado_conteo integer,
  diferencia integer,
  nota text,
  anterior integer,
  posterior integer,
  valor_ajuste numeric,
  primary key (corte_id,producto_id,imei)
);
-- Delta de disponibilidad real: no depende del signo/nombre de movimientos viejos.
create table inventario_control.eventos (
  id bigint generated always as identity primary key,
  ocurrido_at timestamptz not null default clock_timestamp(),
  tienda_codigo text not null,
  producto_id uuid not null,
  imei text not null default '',
  delta integer not null,
  actor uuid,
  ajuste boolean not null default false
);
create index on inventario_control.eventos(tienda_codigo,ocurrido_at,producto_id,imei);
alter table inventario_control.responsables enable row level security;
alter table inventario_control.cortes enable row level security;
alter table inventario_control.lineas enable row level security;
alter table inventario_control.eventos enable row level security;
revoke all on all tables in schema inventario_control from public,anon,authenticated;
revoke all on all sequences in schema inventario_control from public,anon,authenticated;

create function inventario_control.capturar() returns trigger language plpgsql
security definer set search_path = '' as $$
declare v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
 v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
 r record;
begin
 if tg_table_name = 'stock_cantidad' then
   for r in select tienda,producto,sum(q)::integer delta from (
     select v_old->>'tienda_codigo' tienda,(v_old->>'producto_id')::uuid producto,-coalesce((v_old->>'cantidad')::integer,0) q
     union all select v_new->>'tienda_codigo',(v_new->>'producto_id')::uuid,coalesce((v_new->>'cantidad')::integer,0)
   ) s where tienda is not null group by tienda,producto having sum(q)<>0 loop
     insert into inventario_control.eventos(tienda_codigo,producto_id,delta,actor,ajuste)
       values(r.tienda,r.producto,r.delta,auth.uid(),coalesce(current_setting('kora.conteo_ajuste',true),'')='si');
   end loop;
 else
   for r in select tienda,producto,imei,sum(q)::integer delta from (
     select v_old->>'tienda_actual' tienda,(v_old->>'producto_id')::uuid producto,v_old->>'imei' imei,
       case when v_old->>'estado'='disponible' then -1 else 0 end q
     union all select v_new->>'tienda_actual',(v_new->>'producto_id')::uuid,v_new->>'imei',
       case when v_new->>'estado'='disponible' then 1 else 0 end
   ) s where tienda is not null group by tienda,producto,imei having sum(q)<>0 loop
     insert into inventario_control.eventos(tienda_codigo,producto_id,imei,delta,actor,ajuste)
       values(r.tienda,r.producto,coalesce(r.imei,''),r.delta,auth.uid(),coalesce(current_setting('kora.conteo_ajuste',true),'')='si');
   end loop;
 end if;
 return coalesce(new,old);
end $$;
revoke all on function inventario_control.capturar() from public,anon,authenticated;
create trigger conteos_stock after insert or update or delete on public.stock_cantidad
 for each row execute function inventario_control.capturar();
create trigger conteos_unidades after insert or update or delete on public.unidades
 for each row execute function inventario_control.capturar();

create function inventario_control.api(p_accion text,p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 v_perfil public.perfiles%rowtype; v_corte inventario_control.cortes%rowtype;
 v_producto public.productos%rowtype; v_linea inventario_control.lineas%rowtype;
 v_tienda text; v_nombre text; v_autoriza boolean; v_central boolean;
 v_id uuid; v_fecha timestamptz; v_ahora timestamptz; v_rows jsonb; v_row jsonb;
 v_imei text; v_fisico integer; v_esperado integer; v_actual integer; v_delta integer;
 v_costo numeric; v_unidad public.unidades%rowtype; v_result jsonb; v_prev text;
begin
 select * into v_perfil from public.perfiles where id=auth.uid() and activo=true;
 if not found then raise exception 'Sesión sin perfil activo'; end if;
 v_central := coalesce(v_perfil.rol in ('gerencia','auditoria'),false);
 v_autoriza := v_central and exists(select 1 from inventario_control.responsables where perfil_id=v_perfil.id);
 if p_accion='config' then
   return jsonb_build_object('autoriza',v_autoriza,'central',v_central,'tiendas',(
     select coalesce(jsonb_agg(jsonb_build_object('codigo',codigo,'nombre',nombre) order by nombre),'[]'::jsonb)
     from public.origenes where activo=true and tipo='propia' and codigo<>'CENTRAL'
     and (v_central or codigo=v_perfil.tienda_codigo)));
 end if;
 if p_accion='cerrar_solicitud' then
   if not v_autoriza then raise exception 'Solo Mayte u Óscar pueden cerrar solicitudes'; end if;
   if length(btrim(coalesce(p_datos->>'motivo','')))<5 then raise exception 'Documenta por qué se cierra sin ajustar'; end if;
   update public.ajustes_inventario set estado='rechazado',nota_rechazo=p_datos->>'motivo',
     autorizado_por=v_perfil.id,autorizado_at=clock_timestamp()
     where id=(p_datos->>'id')::uuid and estado='pendiente';
   if not found then raise exception 'Solicitud no encontrada o ya procesada'; end if;
   return jsonb_build_object('ok',true,'estado','rechazado');
 end if;
 if p_accion='informe' then
   if (p_datos->>'desde')::date is null or (p_datos->>'hasta')::date is null
     or (p_datos->>'hasta')::date < (p_datos->>'desde')::date then raise exception 'Selecciona un rango válido'; end if;
   return jsonb_build_object('cortes',(
     select coalesce(jsonb_agg(to_jsonb(s) order by s.corte_at,s.id),'[]'::jsonb) from (
       select c.* from inventario_control.cortes c
       where c.corte_at >= ((p_datos->>'desde')::date::timestamp at time zone 'America/Bogota')
       and c.corte_at < (((p_datos->>'hasta')::date+1)::timestamp at time zone 'America/Bogota')
       and (v_central or c.tienda_codigo=v_perfil.tienda_codigo)
       and (nullif(p_datos->>'tienda','') is null or c.tienda_codigo=p_datos->>'tienda')
       and (nullif(p_datos->>'responsable','') is null or
         concat_ws(' ',c.creado_nombre,c.contado_nombre,c.autorizado_nombre) ilike '%'||(p_datos->>'responsable')||'%')
       and (nullif(p_datos->>'despues_id','') is null or
         (c.corte_at,c.id)>((p_datos->>'despues_fecha')::timestamptz,(p_datos->>'despues_id')::uuid))
       order by c.corte_at,c.id limit 200
     ) s));
 end if;
 if p_accion='crear' then
   v_tienda:=p_datos->>'tienda';
   if not v_central and v_tienda is distinct from v_perfil.tienda_codigo then raise exception 'No puedes contar otra tienda'; end if;
   select nombre into v_nombre from public.origenes where codigo=v_tienda and activo=true and tipo='propia' and codigo<>'CENTRAL';
   if not found then raise exception 'Selecciona una tienda activa'; end if;
   -- Fotografía atómica: espera ventas/recepciones abiertas y evita lecturas mixtas.
   lock table public.stock_cantidad,public.unidades in share mode;
   v_ahora:=clock_timestamp();
   insert into inventario_control.cortes(tienda_codigo,tienda_nombre,corte_at,creado_por,creado_nombre)
     values(v_tienda,v_nombre,v_ahora,v_perfil.id,v_perfil.nombre) returning id into v_id;
   insert into inventario_control.lineas(corte_id,producto_id,imei,codigo,nombre,tipo,cantidad_corte,costo_tienda)
     select v_id,s.producto_id,'',p.codigo,p.nombre,p.tipo,s.cantidad,s.precio_tienda
       from public.stock_cantidad s join public.productos p on p.id=s.producto_id
       where s.tienda_codigo=v_tienda and p.tipo='cantidad'
     union all
     select v_id,u.producto_id,u.imei,p.codigo,p.nombre,p.tipo,1,u.precio_tienda
       from public.unidades u join public.productos p on p.id=u.producto_id
       where u.tienda_actual=v_tienda and u.estado='disponible';
 else
   v_id:=(p_datos->>'id')::uuid;
 end if;
 select * into v_corte from inventario_control.cortes where id=v_id for update;
 if not found then raise exception 'Corte no encontrado'; end if;
 if not v_central and v_corte.tienda_codigo is distinct from v_perfil.tienda_codigo then raise exception 'El corte pertenece a otra tienda'; end if;
 if p_accion='subir' then
   if v_corte.estado<>'abierto' then raise exception 'Este corte ya tiene un conteo registrado; no se puede sobrescribir'; end if;
   v_fecha:=(p_datos->>'contado_at')::timestamptz;
   if v_fecha is null or v_fecha<v_corte.corte_at or v_fecha>clock_timestamp() then
     raise exception 'La hora física debe estar entre el corte y el momento actual. Un conteo antiguo necesita conciliación asistida'; end if;
   if coalesce(p_datos->>'sha256','') !~ '^[a-f0-9]{64}$' or length(btrim(coalesce(p_datos->>'archivo','')))=0 then raise exception 'Falta identificación del archivo'; end if;
   v_rows:=p_datos->'filas';
   if jsonb_typeof(v_rows) is distinct from 'array' then raise exception 'Formato de conteo inválido'; end if;
   if jsonb_array_length(v_rows)>20000 then raise exception 'El conteo supera 20.000 filas'; end if;
   if exists(select 1 from jsonb_array_elements(v_rows) x group by x->>'codigo',coalesce(x->>'imei','') having count(*)>1) then raise exception 'Producto/IMEI duplicado'; end if;
   lock table public.stock_cantidad,public.unidades in share mode;
   if exists(select 1 from inventario_control.eventos where tienda_codigo=v_corte.tienda_codigo and ocurrido_at>v_corte.corte_at and ajuste) then
     raise exception 'Hubo otro ajuste desde este corte. Genera un corte nuevo para no aplicarlo dos veces'; end if;
   for v_row in select value from jsonb_array_elements(v_rows) loop
     if jsonb_typeof(v_row->'cantidad') is distinct from 'number' or (v_row->>'cantidad') !~ '^[0-9]+$' then raise exception 'Cantidad física inválida o vacía'; end if;
     v_fisico:=(v_row->>'cantidad')::integer; v_imei:=btrim(coalesce(v_row->>'imei',''));
     select * into v_producto from public.productos where codigo=v_row->>'codigo';
     if not found then raise exception 'Referencia desconocida: %. Mayte debe identificarla en el catálogo antes de continuar',v_row->>'codigo'; end if;
     if (v_producto.tipo='cantidad' and v_imei<>'') or
       (v_producto.tipo='serializado' and (length(v_imei)<6 or v_fisico>1)) then raise exception 'Accesorios sin IMEI; equipos: un serial y cantidad 0 o 1'; end if;
     if exists(select 1 from public.unidades where imei=v_imei and producto_id<>v_producto.id) then raise exception 'El IMEI corresponde a otro producto'; end if;
     insert into inventario_control.lineas(corte_id,producto_id,imei,codigo,nombre,tipo,cantidad_corte,costo_tienda)
       values(v_id,v_producto.id,v_imei,v_producto.codigo,v_producto.nombre,v_producto.tipo,0,null)
       on conflict do nothing;
     select * into v_linea from inventario_control.lineas where corte_id=v_id and producto_id=v_producto.id and imei=v_imei;
     select v_linea.cantidad_corte+coalesce(sum(delta),0) into v_esperado from inventario_control.eventos
       where tienda_codigo=v_corte.tienda_codigo and producto_id=v_producto.id and imei=v_imei
       and ocurrido_at>v_corte.corte_at and ocurrido_at<=v_fecha;
     if v_esperado<0 then raise exception 'Trazabilidad inconsistente; requiere revisión'; end if;
     update inventario_control.lineas set cantidad_fisica=v_fisico,esperado_conteo=v_esperado,
       diferencia=v_fisico-v_esperado,nota=btrim(coalesce(v_row->>'nota',''))
       where corte_id=v_id and producto_id=v_producto.id and imei=v_imei;
   end loop;
   if exists(select 1 from inventario_control.lineas where corte_id=v_id and cantidad_fisica is null) then
     raise exception 'Faltan filas del corte. No se considera cero una fila borrada'; end if;
   -- Obliga a contar también entradas nuevas ocurridas antes de la observación.
   if exists(select 1 from inventario_control.eventos e
     where e.tienda_codigo=v_corte.tienda_codigo and e.ocurrido_at>v_corte.corte_at and e.ocurrido_at<=v_fecha
     and not exists(select 1 from inventario_control.lineas l where l.corte_id=v_id and l.producto_id=e.producto_id and l.imei=e.imei)
     group by e.producto_id,e.imei having sum(e.delta)<>0) then
     raise exception 'Entraron referencias después de descargar. Añádelas al conteo por código/IMEI o toma un corte nuevo'; end if;
   update inventario_control.cortes set estado='pendiente',contado_at=v_fecha,recibido_at=clock_timestamp(),
     contado_por=v_perfil.id,contado_nombre=v_perfil.nombre,archivo_nombre=p_datos->>'archivo',archivo_sha256=p_datos->>'sha256' where id=v_id;
 elsif p_accion in ('aplicar','rechazar') then
   if not v_autoriza then raise exception 'Solo Mayte u Óscar pueden autorizar ajustes'; end if;
   if v_corte.estado not in ('abierto','pendiente') then raise exception 'Este corte ya está cerrado; no se aplicará dos veces'; end if;
   if length(btrim(coalesce(p_datos->>'motivo','')))<5 then raise exception 'Documenta el motivo (mínimo 5 caracteres)'; end if;
   if p_accion='rechazar' then
     update inventario_control.cortes set estado='rechazado',motivo=p_datos->>'motivo',autorizado_at=clock_timestamp(),
       autorizado_por=v_perfil.id,autorizado_nombre=v_perfil.nombre where id=v_id;
   else
     if v_corte.estado<>'pendiente' then raise exception 'Primero registra el conteo físico'; end if;
     if coalesce(p_datos->>'clasificacion','') not in ('correccion_registro','faltante','sobrante_por_aclarar','mixto') then raise exception 'Clasifica la diferencia'; end if;
     if length(btrim(coalesce(p_datos->>'soporte','')))<5 then raise exception 'Registra el soporte o referencia documental de la revisión'; end if;
     lock table public.stock_cantidad,public.unidades in share row exclusive mode;
     if exists(select 1 from inventario_control.eventos where tienda_codigo=v_corte.tienda_codigo and ocurrido_at>v_corte.corte_at and ajuste) then
       raise exception 'Otro ajuste modificó la base. Rechaza este conteo y toma un corte nuevo'; end if;
     v_prev:=current_setting('kora.conteo_ajuste',true);
     perform set_config('kora.conteo_ajuste','si',true);
     for v_linea in select * from inventario_control.lineas where corte_id=v_id order by producto_id,imei loop
       v_delta:=v_linea.diferencia;
       if v_linea.tipo='cantidad' then
         select cantidad,precio_tienda into v_actual,v_costo from public.stock_cantidad where tienda_codigo=v_corte.tienda_codigo and producto_id=v_linea.producto_id;
         v_actual:=coalesce(v_actual,0);
       else
         select * into v_unidad from public.unidades where imei=v_linea.imei;
         v_actual:=case when found and v_unidad.tienda_actual=v_corte.tienda_codigo and v_unidad.estado='disponible' then 1 else 0 end;
         v_costo:=v_unidad.precio_tienda;
       end if;
       v_costo:=coalesce(v_linea.costo_tienda,v_costo);
       if v_delta<>0 then
         -- Costo de nuevos sobrantes lo confirma administración, nunca se infiere del PVP/proveedor.
         if v_costo is null or v_costo<=0 then
           select (x->>'costo_tienda')::numeric into v_costo from jsonb_array_elements(coalesce(p_datos->'costos','[]'::jsonb)) x
             where x->>'codigo'=v_linea.codigo and coalesce(x->>'imei','')=v_linea.imei;
           if v_costo is null or v_costo<=0 or v_costo::text in ('NaN','Infinity','-Infinity') then raise exception 'Confirma costo de tienda de % %',v_linea.codigo,v_linea.imei; end if;
         end if;
         if v_actual+v_delta<0 then raise exception 'El ajuste dejaría negativo %; revisa ventas y fecha del conteo',v_linea.nombre; end if;
         if v_linea.tipo='cantidad' then
           update public.stock_cantidad set cantidad=cantidad+v_delta,
             precio_tienda=case when precio_tienda is null or precio_tienda<=0 then v_costo else precio_tienda end,
             updated_at=clock_timestamp()
             where producto_id=v_linea.producto_id and tienda_codigo=v_corte.tienda_codigo;
           if not found then
             insert into public.stock_cantidad(producto_id,tienda_codigo,cantidad,precio_tienda,costo_promedio)
               values(v_linea.producto_id,v_corte.tienda_codigo,v_delta,v_costo,0);
           end if;
         elsif v_delta=-1 then
           if v_actual<>1 then raise exception 'El equipo ya no está disponible; no se anula una venta ni traslado desde el conteo'; end if;
           update public.unidades set estado='anulado_reingreso' where id=v_unidad.id;
         elsif v_delta=1 then
           if v_unidad.id is not null then raise exception 'Este IMEI ya existe; concilia su venta/remisión, no lo dupliques'; end if;
           insert into public.unidades(producto_id,imei,estado,tienda_actual,precio_tienda,costo_remision)
             values(v_linea.producto_id,v_linea.imei,'disponible',v_corte.tienda_codigo,v_costo,0) returning * into v_unidad;
         else raise exception 'Diferencia serializada inválida';
         end if;
         insert into public.movimientos(tipo,tienda_codigo,producto_id,unidad_id,cantidad,costo,costo_tienda,referencia_tipo,referencia_id,usuario,nota)
           values(case when v_delta>0 then 'ajuste_entrada' else 'ajuste_salida' end,v_corte.tienda_codigo,v_linea.producto_id,
             case when v_linea.tipo='serializado' then v_unidad.id else null end,abs(v_delta),v_costo,v_costo,
             'conteo_inventario',v_id::text,v_perfil.id,concat_ws(' · ',p_datos->>'motivo',p_datos->>'clasificacion',p_datos->>'soporte'));
       end if;
       update inventario_control.lineas set anterior=v_actual,posterior=v_actual+v_delta,
         costo_tienda=v_costo,valor_ajuste=v_delta*coalesce(v_costo,0)
         where corte_id=v_id and producto_id=v_linea.producto_id and imei=v_linea.imei;
     end loop;
     perform set_config('kora.conteo_ajuste',coalesce(v_prev,''),true);
     update inventario_control.cortes set estado=case when exists(select 1 from inventario_control.lineas where corte_id=v_id and diferencia<>0) then 'aplicado' else 'sin_diferencias' end,
       autorizado_at=clock_timestamp(),autorizado_por=v_perfil.id,autorizado_nombre=v_perfil.nombre,
       motivo=p_datos->>'motivo',soporte=p_datos->>'soporte',clasificacion=p_datos->>'clasificacion' where id=v_id;
   end if;
 elsif p_accion not in ('crear','ver') then raise exception 'Acción desconocida';
 end if;
 select to_jsonb(c) into v_result from inventario_control.cortes c where id=v_id;
 return jsonb_build_object('corte',v_result,'lineas',(
   select coalesce(jsonb_agg(to_jsonb(s) order by s.codigo,s.imei),'[]'::jsonb) from (
     select l.*,case when l.tipo='cantidad' then coalesce((select cantidad from public.stock_cantidad where producto_id=l.producto_id and tienda_codigo=v_corte.tienda_codigo),0)
       else (select count(*)::integer from public.unidades where imei=l.imei and estado='disponible' and tienda_actual=v_corte.tienda_codigo) end actual
       from inventario_control.lineas l where corte_id=v_id
   ) s));
end $$;
revoke all on function inventario_control.api(text,jsonb) from public,anon;
grant execute on function inventario_control.api(text,jsonb) to authenticated;
create function public.inventario_conteos(p_accion text,p_datos jsonb default '{}'::jsonb)
 returns jsonb language sql security invoker set search_path = ''
 as $$ select inventario_control.api(p_accion,p_datos); $$;
revoke all on function public.inventario_conteos(text,jsonb) from public,anon;
grant execute on function public.inventario_conteos(text,jsonb) to authenticated;

-- Sin rutas paralelas que apliquen una misma diferencia dos veces.
create or replace function public.inventario_registrar_ajuste(p_tienda_codigo text,p_producto_id uuid,p_cantidad integer,p_motivo text,p_unidad_id uuid default null,p_costo numeric default null,p_estado text default null,p_tienda_destino text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin raise exception 'Los ajustes se autorizan desde Inventario → Conteos y ajustes, con corte y trazabilidad'; end $$;
create or replace function public.autorizar_ajuste(p_ajuste_id uuid,p_accion text,p_nota_rechazo text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if p_accion='rechazar' then return inventario_control.api('cerrar_solicitud',jsonb_build_object('id',p_ajuste_id,'motivo',p_nota_rechazo)); end if;
 raise exception 'Solicitud histórica: revisa el inventario en Conteos y ajustes antes de aplicar diferencias; no se aplican automáticamente';
end $$;
create or replace function public.generar_ajustes_conteo(p_tienda_codigo text,p_unidades_no_encontradas uuid[],p_conteos jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin raise exception 'Registra el conteo con su corte desde Inventario → Conteos y ajustes'; end $$;
revoke all on function public.generar_ajustes_conteo(text,uuid[],jsonb) from public,anon;
revoke all on function public.inventario_registrar_ajuste(text,uuid,integer,text,uuid,numeric,text,text) from public,anon;
revoke all on function public.autorizar_ajuste(uuid,text,text) from public,anon;
-- El congelador anterior descartaba el costo_tienda de ajuste_entrada/salida.
create function inventario_control.costo_movimiento() returns trigger language plpgsql
security definer set search_path='' as $$
begin
 if new.referencia_tipo='conteo_inventario' and new.tipo in ('ajuste_entrada','ajuste_salida') then
   select l.costo_tienda into new.costo_tienda from inventario_control.lineas l
     where l.corte_id::text=new.referencia_id and l.producto_id=new.producto_id
     and l.imei=coalesce((select imei from public.unidades where id=new.unidad_id),'');
   new.costo_tienda:=coalesce(new.costo_tienda,new.costo);
 end if;
 return new;
end $$;
revoke all on function inventario_control.costo_movimiento() from public,anon,authenticated;
create trigger zz_conteo_costo_movimiento before insert on public.movimientos
 for each row execute function inventario_control.costo_movimiento();
-- Solo RPC auditados pueden escribir existencias; las ventas/recepciones SECURITY DEFINER conservan acceso.
revoke insert,update,delete on public.stock_cantidad,public.unidades from authenticated;
-- Las solicitudes no autorizan existencias. Impedir falsificar su estado o identidad por REST.
drop policy if exists "tienda solicita ajuste" on public.ajustes_inventario;
create policy "tienda solicita ajuste" on public.ajustes_inventario for insert to authenticated
 with check(tienda_codigo=public.tienda_actual() and solicitado_por=auth.uid() and estado='pendiente' and autorizado_por is null and autorizado_at is null);
notify pgrst,'reload schema';
commit;

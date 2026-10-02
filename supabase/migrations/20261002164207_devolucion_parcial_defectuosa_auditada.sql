-- Partial accessory return after an already applied, uniquely linked cash correction.
-- Validated cash counts remain immutable; net sale and original cash receipt are distinct.
alter table public.ventas add column efectivo_devuelto_registrado numeric(18,2) not null default 0
  check (efectivo_devuelto_registrado>=0 and efectivo_devuelto_registrado<'Infinity'::numeric);
create table public.venta_devoluciones (
 id uuid primary key default gen_random_uuid(), referencia text not null unique,
 venta_id uuid not null references public.ventas(id), item_id uuid not null unique,
 tienda_codigo text not null references public.origenes(codigo), producto_id uuid not null references public.productos(id),
 cantidad integer not null check(cantidad>0), importe numeric(18,2) not null check(importe>0 and importe<'Infinity'::numeric),
 fecha_devolucion date not null, motivo text not null check(length(trim(motivo))>=10),
 ajuste_caja_id uuid not null unique references public.saldo_ajustes_auditoria(id),
 estado_producto text not null default 'defectuoso_en_tienda' check(estado_producto='defectuoso_en_tienda'),
 estado text not null default 'en_proceso' check(estado in ('en_proceso','aplicada')),
 item_anterior jsonb not null, venta_anterior jsonb not null,
 registrado_por uuid not null references public.perfiles(id), created_at timestamptz not null default now(),
 movimiento_inventario_id bigint references public.movimientos(id)
);
create index venta_devoluciones_tienda on public.venta_devoluciones(tienda_codigo,estado);
alter table public.venta_devoluciones enable row level security;
revoke all on public.venta_devoluciones from public,anon,authenticated;
grant select(id,referencia,venta_id,item_id,tienda_codigo,producto_id,cantidad,importe,fecha_devolucion,motivo,ajuste_caja_id,estado_producto,estado,registrado_por,created_at,movimiento_inventario_id) on public.venta_devoluciones to authenticated;
create policy devoluciones_lectura on public.venta_devoluciones for select to authenticated using(
 estado='aplicada' and exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo
 and (p.rol in ('gerencia','auditoria') or (p.rol='admin_tienda' and p.tienda_codigo=venta_devoluciones.tienda_codigo)))
);

create function kora_private.devolucion_parcial_permitida(t text,op text,antes jsonb,despues jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare d public.venta_devoluciones%rowtype;
begin
 if not exists(select 1 from public.perfiles where id=auth.uid() and activo and rol in ('gerencia','auditoria')) then return false; end if;
 select * into d from public.venta_devoluciones where id::text=nullif(current_setting('app.devolucion_parcial_id',true),'')
 and estado='en_proceso' and registrado_por=auth.uid();
 if not found then return false; end if;
 if t='venta_items' and op='DELETE' then return antes=d.item_anterior; end if;
 if t='ventas' and op='UPDATE' then
  return antes=d.venta_anterior and despues->>'id'=d.venta_id::text
   and (despues-'total'-'nota'-'efectivo_devuelto_registrado')=(antes-'total'-'nota'-'efectivo_devuelto_registrado')
   and (despues->>'total')::numeric=(antes->>'total')::numeric-d.importe
   and (despues->>'efectivo_devuelto_registrado')::numeric=(antes->>'efectivo_devuelto_registrado')::numeric+d.importe;
 end if;
 return false;
end $$;
revoke all on function kora_private.devolucion_parcial_permitida(text,text,jsonb,jsonb) from public,anon,authenticated;

create function kora_private.proteger_efectivo_devuelto()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.efectivo_devuelto_registrado<>0 then raise exception 'El efectivo devuelto se registra mediante devolución auditada'; end if;
 elsif new.efectivo_devuelto_registrado is distinct from old.efectivo_devuelto_registrado
   and not kora_private.devolucion_parcial_permitida(tg_table_name,tg_op,to_jsonb(old),to_jsonb(new)) then
  raise exception 'El efectivo devuelto requiere una devolución auditada';
 end if;
 return new;
end $$;
revoke all on function kora_private.proteger_efectivo_devuelto() from public,anon,authenticated;
create trigger proteger_efectivo_devuelto before insert or update of efectivo_devuelto_registrado on public.ventas
for each row execute function kora_private.proteger_efectivo_devuelto();

-- A narrowly checked exception for the two exact rows of an authorized return.
-- It never alters caja_cortes or caja_diaria and never permits arbitrary closed-day writes.
do $$
declare def text; needle text;
begin
 def:=pg_get_functiondef('public.caja_guardar_movimiento()'::regprocedure);
 needle:=$n$  fila:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;$n$;
 if position(needle in def)=0 then raise exception 'Revisar versión del control de caja'; end if;
 execute replace(def,needle,needle||$p$
  if tg_table_name in ('ventas','venta_items') and tg_op in ('UPDATE','DELETE')
    and kora_private.devolucion_parcial_permitida(tg_table_name,tg_op,to_jsonb(old),case when tg_op='UPDATE' then to_jsonb(new) else null end) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
$p$);
 -- Cash reports must retain the actual original receipt; the refund has its own cash movement.
 def:=pg_get_functiondef('public.caja_componentes_rango(text,date,date)'::regprocedure);
 if position('sum(v.total)' in def)=0 then raise exception 'Revisar componentes de caja'; end if;
 execute replace(def,'sum(v.total)','sum(v.total+v.efectivo_devuelto_registrado)');
 def:=pg_get_functiondef('public.obtener_cuadre_caja(text,date)'::regprocedure);
 if position('sum(v.total)' in def)=0 then raise exception 'Revisar cuadre de caja'; end if;
 execute replace(def,'sum(v.total)','sum(v.total+v.efectivo_devuelto_registrado)');
 -- Do not let the full-sale void path reverse previously returned goods again.
 def:=pg_get_functiondef('public.anular_venta_administrativa(uuid,text)'::regprocedure);
 needle:=$n$  if coalesce(v_venta.anulada,false) then raise exception 'La venta ya está anulada'; end if;$n$;
 if position(needle in def)=0 then raise exception 'Revisar anulación de venta'; end if;
 execute replace(def,needle,needle||$p$
  if v_venta.efectivo_devuelto_registrado>0 then raise exception 'La venta tiene devolución parcial; revisa sus artículos restantes sin repetir el reembolso'; end if;
$p$);
end $$;

create function kora_private.registrar_devolucion_defectuosa(p_referencia text,p_item uuid,p_ajuste_caja uuid,p_fecha date,p_motivo text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.ventas%rowtype; i public.venta_items%rowtype; a public.saldo_ajustes_auditoria%rowtype;
 d public.venta_devoluciones%rowtype; importe numeric; antes_caja numeric; despues_caja numeric;
 origen_mov bigint; mov bigint; ajuste uuid; restante numeric; hoy date:=(now() at time zone 'America/Bogota')::date;
begin
 if not exists(select 1 from public.perfiles where id=auth.uid() and activo and rol in ('gerencia','auditoria')) then raise exception 'Solo Gerencia o Auditoría'; end if;
 if nullif(trim(p_referencia),'') is null or p_item is null or p_ajuste_caja is null or p_fecha is null or p_fecha>hoy
   or length(trim(coalesce(p_motivo,'')))<10 then raise exception 'Datos incompletos de devolución'; end if;
 perform pg_advisory_xact_lock(hashtextextended('devolucion:'||p_referencia,0));
 select * into d from public.venta_devoluciones where referencia=p_referencia;
 if found then
  if d.item_id<>p_item or d.ajuste_caja_id<>p_ajuste_caja or d.fecha_devolucion<>p_fecha or d.estado<>'aplicada' then raise exception 'Referencia de devolución ya utilizada'; end if;
  return jsonb_build_object('ok',true,'id',d.id,'ya_aplicada',true);
 end if;
 select * into i from public.venta_items where id=p_item;
 if not found then raise exception 'Artículo no disponible para devolución'; end if;
 select * into v from public.ventas where id=i.venta_id;
 perform pg_advisory_xact_lock(hashtextextended('caja-arrastre:'||v.tienda_codigo,0));
 select * into v from public.ventas where id=i.venta_id for update;
 select * into i from public.venta_items where id=p_item for update;
 if not found or v.anulada or v.tipo<>'contado' or i.unidad_id is not null or p_fecha<v.fecha
  or not exists(select 1 from public.productos where id=i.producto_id and tipo='cantidad') then raise exception 'Solo accesorios de una venta de contado vigente'; end if;
 importe:=i.precio_venta*i.cantidad;
 select coalesce(sum(cantidad*precio_venta),0) into restante from public.venta_items where venta_id=v.id and id<>i.id;
 if importe<=0 or restante<=0 or restante+importe<>v.total then raise exception 'La devolución debe conservar los demás artículos y coincidir con el total'; end if;
 select * into a from public.saldo_ajustes_auditoria where id=p_ajuste_caja for update;
 if not found or a.estado<>'aplicado' or a.referencia<>p_referencia or a.tienda_codigo<>v.tienda_codigo
  or a.caja_base-a.caja_objetivo<>importe or a.deuda_base<>a.deuda_objetivo
  or not exists(select 1 from public.movimientos_caja_tienda m where m.id=a.movimiento_caja_id and m.idempotency_key=a.id
   and m.tienda_codigo=v.tienda_codigo and m.tipo='ajuste_auditoria_salida' and m.monto=importe)
 then raise exception 'La devolución requiere el ajuste de efectivo ya aplicado por el mismo importe y referencia'; end if;
 antes_caja:=(public.caja_calcular_interno(v.tienda_codigo,hoy)->>'esperado')::numeric;
 insert into public.venta_devoluciones(referencia,venta_id,item_id,tienda_codigo,producto_id,cantidad,importe,fecha_devolucion,motivo,ajuste_caja_id,item_anterior,venta_anterior,registrado_por)
 values(p_referencia,v.id,i.id,v.tienda_codigo,i.producto_id,i.cantidad,importe,p_fecha,p_motivo,a.id,to_jsonb(i),to_jsonb(v),auth.uid()) returning * into d;
 perform set_config('app.devolucion_parcial_id',d.id::text,true);
 perform set_config('app.ajuste_venta_autorizado','1',true);
 delete from public.venta_items where id=i.id;
 update public.ventas set total=restante,efectivo_devuelto_registrado=efectivo_devuelto_registrado+importe,
 nota=concat_ws(E'\n',nota,'DEVOLUCIÓN PARCIAL APLICADA · '||p_referencia||' · '||i.cantidad||' unidad(es) defectuosa(s) en tienda · $'||importe||' · ajuste de caja ya aplicado; no volver a descontar.') where id=v.id;
 select id into origen_mov from public.movimientos where referencia_tipo='venta' and referencia_id=v.id::text and producto_id=i.producto_id and unidad_id is null order by id limit 1;
 insert into public.movimientos(tipo,tienda_codigo,producto_id,cantidad,costo,precio,referencia_tipo,referencia_id,reverso_de,usuario,nota)
 values('ajuste_entrada',v.tienda_codigo,i.producto_id,i.cantidad,i.costo_congelado,i.precio_venta,
 'devolucion_defectuosa',d.id::text,origen_mov,auth.uid(),p_referencia||' · Reingreso físico DEFECTUOSO EN TIENDA, NO DISPONIBLE PARA VENTA. '||p_motivo) returning id into mov;
 update public.venta_devoluciones set estado='aplicada',movimiento_inventario_id=mov where id=d.id;
 insert into public.venta_ajustes_administrativos(venta_id,tipo,motivo,valores_anteriores,valores_nuevos,usuario_id)
 values(v.id,'correccion_datos','Devolución parcial · '||p_referencia||' · '||p_motivo,
 jsonb_build_object('venta',to_jsonb(v),'articulo_devuelto',to_jsonb(i)),
 jsonb_build_object('venta',(select to_jsonb(x) from public.ventas x where id=v.id),'devolucion_id',d.id,'inventario_defectuoso',i.cantidad,'ajuste_caja_id',a.id),auth.uid()) returning id into ajuste;
 despues_caja:=(public.caja_calcular_interno(v.tienda_codigo,hoy)->>'esperado')::numeric;
 if antes_caja is distinct from despues_caja then raise exception 'La devolución intentó modificar nuevamente la caja'; end if;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
 values(auth.uid()::text,'DEVOLUCION_PARCIAL_DEFECTUOSA','venta_devoluciones',d.id::text,
 jsonb_build_object('referencia',p_referencia,'venta_id',v.id,'total_antes',v.total,'total_despues',restante,'importe',importe,'caja_sin_cambio',despues_caja,'ajuste_caja_id',a.id,'movimiento_inventario_id',mov,'ajuste_venta_id',ajuste));
 perform set_config('app.devolucion_parcial_id','',true);
 perform set_config('app.ajuste_venta_autorizado','',true);
 return jsonb_build_object('ok',true,'id',d.id,'total_venta',restante,'caja',despues_caja,'cantidad_defectuosa',i.cantidad,'ya_aplicada',false);
end $$;
revoke all on function kora_private.registrar_devolucion_defectuosa(text,uuid,uuid,date,text) from public,anon;
grant usage on schema kora_private to authenticated;
grant execute on function kora_private.registrar_devolucion_defectuosa(text,uuid,uuid,date,text) to authenticated;
create function public.registrar_devolucion_defectuosa(p_referencia text,p_item uuid,p_ajuste_caja uuid,p_fecha date,p_motivo text)
returns jsonb language sql security invoker set search_path='' as $$
 select kora_private.registrar_devolucion_defectuosa(p_referencia,p_item,p_ajuste_caja,p_fecha,p_motivo);
$$;
revoke all on function public.registrar_devolucion_defectuosa(text,uuid,uuid,date,text) from public,anon;
grant execute on function public.registrar_devolucion_defectuosa(text,uuid,uuid,date,text) to authenticated;

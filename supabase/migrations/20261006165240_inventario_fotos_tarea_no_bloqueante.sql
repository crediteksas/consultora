-- Gerencia puede aplicar el corte sin fotos. La evidencia queda como tarea de
-- la administradora de la tienda; completarla nunca repite la salida ni el gasto.
begin;
alter table inventario_control.no_conformes alter column foto_path drop not null;
alter table inventario_control.no_conformes
  add column foto_por uuid references public.perfiles(id),
  add column foto_at timestamptz,
  add constraint foto_diferida_solo_conteo check(foto_path is not null or corte_id is not null);
update inventario_control.no_conformes set foto_por=creado_por,foto_at=creado_at
  where foto_path is not null;
create index no_conformes_fotos_pendientes on inventario_control.no_conformes(tienda_codigo,creado_at)
  where foto_path is null and estado='separado_pendiente_destino';

do $migration$
declare def text; needle text; replacement text;
begin
  def:=pg_get_functiondef('inventario_control.no_conformes_api(text,jsonb)'::regprocedure);
  needle:=$old$ if p_accion='listar' then$old$;
  replacement:=$new$ if p_accion='tareas_fotos' then
   return jsonb_build_object('tareas',(
     select coalesce(jsonb_agg(to_jsonb(x) order by x.creado_at,x.id),'[]'::jsonb)
     from (select n.id,n.tienda_codigo,n.corte_id,n.imei,n.cantidad,n.creado_at,
       pr.codigo,pr.nombre producto_nombre,o.nombre tienda_nombre,d.numero documento_numero
       from inventario_control.no_conformes n
       join public.productos pr on pr.id=n.producto_id
       join public.origenes o on o.codigo=n.tienda_codigo
       left join inventario_control.ajuste_documentos d on d.corte_id=n.corte_id
       where n.foto_path is null and n.estado='separado_pendiente_destino'
         and (central or (p.rol='admin_tienda' and (n.tienda_codigo=p.tienda_codigo or exists(
           select 1 from public.sesiones_conteo_cruzado s where s.admin_autorizado=p.id
             and s.tienda_auditada=n.tienda_codigo and s.estado='abierta'
             and s.vigencia_hasta>clock_timestamp()))))) x));
 end if;
 if p_accion='completar_foto' then
   select * into n from inventario_control.no_conformes where id=(p_datos->>'id')::uuid for update;
   if not found then raise exception 'Tarea de evidencia no encontrada'; end if;
   if not central and (p.rol<>'admin_tienda' or (n.tienda_codigo is distinct from p.tienda_codigo
     and not exists(select 1 from public.sesiones_conteo_cruzado s where s.admin_autorizado=p.id
       and s.tienda_auditada=n.tienda_codigo and s.estado='abierta'
       and s.vigencia_hasta>clock_timestamp()))) then
     raise exception 'No puedes completar la evidencia de otra tienda'; end if;
   if n.corte_id is null or n.estado<>'separado_pendiente_destino' then
     raise exception 'Esta salida no es una tarea de evidencia de un ajuste aplicado'; end if;
   if coalesce(p_datos->>'foto_path','') !~ ('^'||n.tienda_codigo||'/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
     or not exists(select 1 from storage.objects o where o.bucket_id='inventario-no-conformes'
       and o.name=p_datos->>'foto_path' and o.owner_id=p.id::text) then
     raise exception 'Adjunta una foto propia y válida para completar la tarea'; end if;
   if n.foto_path is not null then
     if n.foto_path=p_datos->>'foto_path' then
       return jsonb_build_object('id',n.id,'evidencia_completa',true,'stock_modificado',false);
     end if;
     raise exception 'Esta tarea ya tiene su foto registrada';
   end if;
   update inventario_control.no_conformes set foto_path=p_datos->>'foto_path',
     foto_por=p.id,foto_at=clock_timestamp() where id=n.id;
   return jsonb_build_object('id',n.id,'evidencia_completa',true,'stock_modificado',false);
 end if;
 if p_accion='listar' then$new$;
  if strpos(def,needle)=0 then raise exception 'Cambió la consulta de no conformes'; end if;
  def:=replace(def,needle,replacement);

  needle:=$old$       if not found or n.cantidad<>abs(l.diferencia) or not exists(
         select 1 from storage.objects o where o.bucket_id='inventario-no-conformes'
           and o.name=n.foto_path) then
         raise exception 'Falta solicitud con foto para el no conforme %',l.codigo; end if;
       update inventario_control.no_conformes set costo_tienda=l.costo_tienda where id=n.id;$old$;
  replacement:=$new$       if not found then
         insert into inventario_control.no_conformes(tienda_codigo,producto_id,imei,cantidad,
           categoria_gasto,foto_path,motivo,soporte,corte_id,creado_por)
         values(c.tienda_codigo,l.producto_id,l.imei,abs(l.diferencia),'producto_deteriorado',null,
           concat_ws(' · ',p_datos->>'motivo',nullif(btrim(l.nota),'')),p_datos->>'soporte',c.id,p.id)
         returning * into n;
       end if;
       if n.cantidad<>abs(l.diferencia) then
         raise exception 'La cantidad no conforme no coincide con la diferencia de %',l.codigo; end if;
       update inventario_control.no_conformes set costo_tienda=l.costo_tienda,
         foto_por=case when exists(select 1 from storage.objects o
           where o.bucket_id='inventario-no-conformes' and o.name=n.foto_path) then coalesce(n.foto_por,n.creado_por) end,
         foto_at=case when exists(select 1 from storage.objects o
           where o.bucket_id='inventario-no-conformes' and o.name=n.foto_path) then coalesce(n.foto_at,n.creado_at) end,
         foto_path=case when exists(select 1 from storage.objects o
           where o.bucket_id='inventario-no-conformes' and o.name=n.foto_path) then n.foto_path end
         where id=n.id;$new$;
  if strpos(def,needle)=0 then raise exception 'Cambió el control de fotos del ajuste'; end if;
  def:=replace(def,needle,replacement);
  execute def;
end $migration$;

create function inventario_control.fotos_pendientes_cantidad()
returns bigint language plpgsql stable security definer set search_path='' as $$
declare p public.perfiles%rowtype;
begin
  select * into p from public.perfiles where id=auth.uid() and activo;
  if not found then return 0; end if;
  return (select count(*) from inventario_control.no_conformes n
    where n.foto_path is null and n.estado='separado_pendiente_destino'
      and (p.rol in ('gerencia','auditoria') or (p.rol='admin_tienda' and
        (n.tienda_codigo=p.tienda_codigo or exists(select 1 from public.sesiones_conteo_cruzado s
          where s.admin_autorizado=p.id and s.tienda_auditada=n.tienda_codigo
            and s.estado='abierta' and s.vigencia_hasta>clock_timestamp())))));
end $$;
revoke all on function inventario_control.fotos_pendientes_cantidad() from public,anon;
grant execute on function inventario_control.fotos_pendientes_cantidad() to authenticated;
create function public.inventario_fotos_pendientes_cantidad()
returns bigint language sql stable security invoker set search_path='' as $$
  select inventario_control.fotos_pendientes_cantidad();
$$;
revoke all on function public.inventario_fotos_pendientes_cantidad() from public,anon;
grant execute on function public.inventario_fotos_pendientes_cantidad() to authenticated;
notify pgrst,'reload schema';
commit;

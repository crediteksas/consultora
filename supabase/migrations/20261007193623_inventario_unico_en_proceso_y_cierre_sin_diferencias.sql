-- Un ciclo operativo por tienda. No se anulan ni modifican cortes existentes.
-- El bloqueo por tienda ya usado al crear serializa también clics concurrentes.
begin;
do $migration$
declare
  definition text := pg_get_functiondef('inventario_control.api(text,jsonb)'::regprocedure);
  old text;
  replacement text;
begin
  old := $code$ if p_accion='crear' then$code$;
  replacement := $code$ if p_accion='en_proceso' then
   v_tienda:=p_datos->>'tienda';
   if not v_central and v_tienda is distinct from v_perfil.tienda_codigo and not exists (
     select 1 from public.sesiones_conteo_cruzado s where s.admin_autorizado=v_perfil.id
       and s.tienda_auditada=v_tienda and s.estado='abierta'
       and s.vigencia_hasta>clock_timestamp()) then raise exception 'No puedes contar otra tienda'; end if;
   if not exists(select 1 from public.origenes where codigo=v_tienda and activo=true
     and tipo='propia' and codigo<>'CENTRAL') then raise exception 'Selecciona una tienda activa'; end if;
   return jsonb_build_object('cortes',(
     select coalesce(jsonb_agg(to_jsonb(c) order by c.corte_at,c.id),'[]'::jsonb)
     from inventario_control.cortes c where c.tienda_codigo=v_tienda
       and c.estado in ('abierto','pendiente')
       and not coalesce((c.revision_fuente->>'solo_comparativo')::boolean,false)));
 end if;
 if p_accion='crear' then$code$;
  if strpos(definition,old)=0 then raise exception 'Cambió el inicio de la API de conteos'; end if;
  definition:=replace(definition,old,replacement);

  old := $code$   -- Fotografía atómica: espera ventas/recepciones abiertas y evita lecturas mixtas.$code$;
  replacement := $code$   if exists(select 1 from inventario_control.cortes c where c.tienda_codigo=v_tienda
     and c.estado in ('abierto','pendiente')
     and not coalesce((c.revision_fuente->>'solo_comparativo')::boolean,false)) then
     raise exception 'Ya hay un inventario en proceso en esta tienda. Continúa ese corte: carga el conteo y ciérralo sin diferencias, o aplica el ajuste y cierre si hay diferencias. No se creó otro inventario';
   end if;
$code$ || old;
  if strpos(definition,old)=0 then raise exception 'Cambió la fotografía atómica del inventario'; end if;
  definition:=replace(definition,old,replacement);
  execute definition;
end;
$migration$;

-- Cierre explícito sin diferencias, con el mismo bloqueo, versión, soporte,
-- autorización e historial que la revisión existente. No crea movimientos.
create or replace function inventario_control.documento_api(p_accion text,p_datos jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.perfiles%rowtype; c inventario_control.cortes%rowtype;
  result jsonb; doc jsonb; authoriza boolean;
begin
  select * into p from public.perfiles where id=auth.uid() and activo;
  if not found then raise exception 'Sesión sin perfil activo'; end if;
  if p_accion is null or p_accion not in ('ver','aplicar','cerrar') then raise exception 'Acción de inventario desconocida'; end if;
  result:=inventario_control.api('ver',p_datos);
  select * into c from inventario_control.cortes where id=(p_datos->>'id')::uuid for update;
  result:=inventario_control.api('ver',p_datos);
  authoriza:=coalesce(p.rol in ('gerencia','auditoria'),false) and exists(
    select 1 from inventario_control.responsables where perfil_id=p.id);
  if p_accion in ('aplicar','cerrar') then
    if not authoriza then raise exception 'Solo Mayte u Óscar pueden aplicar ajustes o cerrar el inventario'; end if;
    if p_accion='cerrar' then
      if c.contado_at is null or c.estado not in ('pendiente','sin_diferencias') then
        raise exception 'Primero registra y revisa el conteo antes de cerrar el inventario'; end if;
      if exists(select 1 from inventario_control.lineas where corte_id=c.id
        and (cantidad_fisica is null or diferencia is distinct from 0)) then
        raise exception 'El conteo tiene diferencias o está incompleto. Usa Aplicar ajuste y cerrar inventario'; end if;
      p_datos:=p_datos||jsonb_build_object('clasificacion','correccion_registro','decisiones','[]'::jsonb,'costos','[]'::jsonb);
    end if;
    if not exists(select 1 from inventario_control.ajuste_documentos where corte_id=c.id) then
      result:=inventario_control.no_conformes_api('aplicar_conteo',p_datos);
    end if;
  end if;
  select d.detalle||jsonb_build_object('documento_id',d.id) into doc
    from inventario_control.ajuste_documentos d where d.corte_id=c.id;
  return result||jsonb_build_object('documento',doc,'puede_cerrar_utilidad',p.rol='gerencia');
end $$;
revoke all on function inventario_control.documento_api(text,jsonb) from public,anon;
grant execute on function inventario_control.documento_api(text,jsonb) to authenticated;

-- Los documentos anteriores permanecen inmutables. Los nuevos cierres sin
-- diferencias se identifican como CI, no como un ajuste de existencias AJ.
do $migration$
declare
  definition text := pg_get_functiondef('inventario_control.documentar_ajuste()'::regprocedure);
  old text := $code$numero:='AJ-'||new.tienda_codigo||'-'||lpad(seq::text,6,'0');$code$;
begin
  if strpos(definition,old)=0 then raise exception 'Cambió el consecutivo del documento de inventario'; end if;
  execute replace(definition,old,$code$numero:=(case when new.estado='sin_diferencias' then 'CI-' else 'AJ-' end)||new.tienda_codigo||'-'||lpad(seq::text,6,'0');$code$);
end;
$migration$;
notify pgrst,'reload schema';
commit;

-- Corregir lo contado no autoriza ajustes: solo cambia cantidad reportada y
-- observación, con versión e historial. El acceso propio/cruzado se revalida
-- mediante la API vigente; sus permisos de aplicar ajustes no se modifican.
begin;
do $migration$
declare
  definition text := pg_get_functiondef('inventario_control.correcciones_api(text,jsonb)'::regprocedure);
  old text;
  replacement text;
begin
  old := 'historico jsonb; v_version integer;';
  if strpos(definition,old)=0 then raise exception 'Cambió la declaración de correcciones'; end if;
  definition := replace(definition,old,old || ' v_edita boolean;');

  old := 'select * into c from inventario_control.cortes where id=(p_datos->>''id'')::uuid for update;';
  replacement := old || $code$
  v_edita := coalesce(p.rol='admin_tienda',false) or (
    coalesce(p.rol in ('gerencia','auditoria'),false) and exists(
      select 1 from inventario_control.responsables where perfil_id=p.id));$code$;
  if strpos(definition,old)=0 then raise exception 'Cambió la consulta autorizada del corte'; end if;
  definition := replace(definition,old,replacement);

  old := $code$if not coalesce(p.rol in ('gerencia','auditoria'),false) or not exists(
      select 1 from inventario_control.responsables where perfil_id=p.id) then
      raise exception 'Solo Mayte u Óscar pueden corregir el conteo registrado';$code$;
  replacement := $code$if not v_edita then
      raise exception 'No tienes permiso para corregir el conteo registrado';$code$;
  if strpos(definition,old)=0 then raise exception 'Cambió el permiso de correcciones'; end if;
  definition := replace(definition,old,replacement);

  old := $code$return result||jsonb_build_object('correcciones',historico,'stock_modificado',false);$code$;
  replacement := $code$return result||jsonb_build_object('correcciones',historico,'stock_modificado',false,
    'puede_editar',v_edita and c.estado='pendiente' and c.base_conteo='corte_fijo'
      and not coalesce((c.revision_fuente->>'solo_comparativo')::boolean,false)
      and not exists(select 1 from inventario_control.ajuste_documentos where corte_id=c.id));$code$;
  if strpos(definition,old)=0 then raise exception 'Cambió la respuesta de correcciones'; end if;
  definition := replace(definition,old,replacement);
  execute definition;
end;
$migration$;
notify pgrst,'reload schema';
commit;

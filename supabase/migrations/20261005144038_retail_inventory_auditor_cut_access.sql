-- Una sesión de auditoría cruzada vigente permite registrar el conteo físico
-- de esa tienda, sin cambiar la tienda principal ni conceder aprobación.
-- Conserva la función vigente (y cualquier otra regla posterior) mediante
-- reemplazos exactos; falla si la definición de producción ya cambió.
do $migration$
declare
  v_definition text := pg_get_functiondef('inventario_control.api(text,jsonb)'::regprocedure);
  v_old text;
  v_new text;
  v_count integer;
  v_session text := $predicate$exists (
    select 1 from public.sesiones_conteo_cruzado s
    where s.admin_autorizado = v_perfil.id
      and s.tienda_auditada = %s
      and s.estado = 'abierta'
      and s.vigencia_hasta > clock_timestamp()
  )$predicate$;
begin
  if v_definition is null then
    raise exception 'No existe inventario_control.api(text,jsonb)';
  end if;

  v_old := 'and (v_central or codigo=v_perfil.tienda_codigo)';
  v_new := 'and (v_central or codigo=v_perfil.tienda_codigo or ' ||
    format(v_session, 'codigo') || ')';
  v_count := (length(v_definition) - length(replace(v_definition,v_old,''))) / length(v_old);
  if v_count <> 1 then raise exception 'Cambió el filtro de tiendas del conteo'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := 'and (v_central or c.tienda_codigo=v_perfil.tienda_codigo)';
  v_new := 'and (v_central or c.tienda_codigo=v_perfil.tienda_codigo or ' ||
    format(v_session, 'c.tienda_codigo') || ')';
  v_count := (length(v_definition) - length(replace(v_definition,v_old,''))) / length(v_old);
  if v_count <> 1 then raise exception 'Cambió el acceso al historial del conteo'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := 'if not v_central and v_tienda is distinct from v_perfil.tienda_codigo then raise exception ''No puedes contar otra tienda''; end if;';
  v_new := 'if not v_central and v_tienda is distinct from v_perfil.tienda_codigo and not ' ||
    format(v_session, 'v_tienda') || ' then raise exception ''No puedes contar otra tienda''; end if;';
  v_count := (length(v_definition) - length(replace(v_definition,v_old,''))) / length(v_old);
  if v_count <> 1 then raise exception 'Cambió la autorización para crear cortes'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := 'if not v_central and v_corte.tienda_codigo is distinct from v_perfil.tienda_codigo then raise exception ''El corte pertenece a otra tienda''; end if;';
  v_new := 'if not v_central and v_corte.tienda_codigo is distinct from v_perfil.tienda_codigo and not ' ||
    format(v_session, 'v_corte.tienda_codigo') || ' then raise exception ''El corte pertenece a otra tienda''; end if;';
  v_count := (length(v_definition) - length(replace(v_definition,v_old,''))) / length(v_old);
  if v_count <> 1 then raise exception 'Cambió la autorización para cargar cortes'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  execute v_definition;
end;
$migration$;

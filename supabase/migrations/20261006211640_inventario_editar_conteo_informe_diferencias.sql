-- Corrige el dato contado, nunca las existencias. El Excel original y cada
-- versión permanecen identificados; una autorización vieja no aplica una nueva.
begin;
alter table inventario_control.cortes add column conteo_version integer not null default 0 check(conteo_version>=0);
create table inventario_control.conteo_correcciones (
  id uuid primary key default gen_random_uuid(),
  corte_id uuid not null references inventario_control.cortes(id),
  version integer not null check(version>0),
  creado_at timestamptz not null default clock_timestamp(),
  creado_por uuid not null references public.perfiles(id),
  creado_nombre text not null,
  motivo text not null check(length(btrim(motivo))>=5),
  archivo_nombre text,
  archivo_sha256 text,
  cambios jsonb not null check(jsonb_typeof(cambios)='array' and jsonb_array_length(cambios)>0),
  unique(corte_id,version)
);
create index conteo_correcciones_creado_por_idx on inventario_control.conteo_correcciones(creado_por);
alter table inventario_control.conteo_correcciones enable row level security;
revoke all on inventario_control.conteo_correcciones from public,anon,authenticated;
create trigger conteo_correccion_inmutable before update or delete on inventario_control.conteo_correcciones
  for each row execute function inventario_control.documento_inmutable();

create function inventario_control.correcciones_api(p_accion text,p_datos jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  p public.perfiles%rowtype; c inventario_control.cortes%rowtype;
  l inventario_control.lineas%rowtype; fila jsonb; v_cantidad integer; v_nota text;
  result jsonb; cambios jsonb:='[]'::jsonb; historico jsonb; v_version integer;
begin
  select * into p from public.perfiles where id=auth.uid() and activo;
  if not found then raise exception 'Sesión sin perfil activo'; end if;
  if p_accion is null or p_accion not in ('ver','guardar') then raise exception 'Acción de corrección desconocida'; end if;
  -- Conserva el acceso propio / cruzado vigente y el aislamiento entre tiendas.
  result:=inventario_control.api('ver',jsonb_build_object('id',p_datos->>'id'));
  select * into c from inventario_control.cortes where id=(p_datos->>'id')::uuid for update;
  if p_accion='guardar' then
    if not coalesce(p.rol in ('gerencia','auditoria'),false) or not exists(
      select 1 from inventario_control.responsables where perfil_id=p.id) then
      raise exception 'Solo Mayte u Óscar pueden corregir el conteo registrado';
    end if;
    if c.estado<>'pendiente' or c.base_conteo<>'corte_fijo'
      or coalesce((c.revision_fuente->>'solo_comparativo')::boolean,false)
      or exists(select 1 from inventario_control.ajuste_documentos where corte_id=c.id) then
      raise exception 'Solo se edita un conteo pendiente, antes de aplicar el ajuste';
    end if;
    if coalesce(p_datos->>'conteo_version','') !~ '^[0-9]+$'
      or (p_datos->>'conteo_version')::numeric<>c.conteo_version then
      raise exception 'El conteo cambió. Vuelve a consultar antes de corregirlo';
    end if;
    if length(btrim(coalesce(p_datos->>'motivo','')))<5 then raise exception 'Explica el motivo de la corrección (mínimo 5 caracteres)'; end if;
    if jsonb_typeof(p_datos->'filas') is distinct from 'array' then raise exception 'Formato de corrección inválido'; end if;
    if jsonb_array_length(p_datos->'filas')>20000 then raise exception 'La corrección supera 20.000 filas'; end if;
    if exists(select 1 from jsonb_array_elements(p_datos->'filas') f
      group by f->>'codigo',coalesce(f->>'imei','') having count(*)>1) then raise exception 'Referencia/IMEI duplicado'; end if;
    for fila in select value from jsonb_array_elements(p_datos->'filas') loop
      select * into l from inventario_control.lineas where corte_id=c.id
        and codigo=fila->>'codigo' and imei=coalesce(fila->>'imei','') for update;
      if not found then raise exception 'Referencia/IMEI ajeno al conteo: %',fila->>'codigo'; end if;
      if jsonb_typeof(fila->'cantidad') is distinct from 'number'
        or coalesce(fila->>'cantidad','') !~ '^[0-9]+$'
        or (fila->>'cantidad')::numeric>2147483647 then raise exception 'Cantidad inválida: usa enteros no negativos'; end if;
      v_cantidad:=(fila->>'cantidad')::integer;
      if l.tipo='serializado' and v_cantidad>1 then raise exception 'Cada IMEI solo admite cantidad 0 o 1'; end if;
      v_nota:=case when fila ? 'nota' then btrim(coalesce(fila->>'nota','')) else l.nota end;
      if length(coalesce(v_nota,''))>2000 then raise exception 'La observación supera 2.000 caracteres'; end if;
      if l.cantidad_fisica is distinct from v_cantidad or coalesce(l.nota,'') is distinct from coalesce(v_nota,'') then
        -- Las bajas ya solicitadas no se cambian silenciosamente desde el conteo.
        if exists(select 1 from inventario_control.no_conformes n where n.corte_id=c.id
          and n.producto_id=l.producto_id and n.imei=l.imei and n.estado<>'rechazado'
          and v_cantidad-l.cantidad_corte<>-n.cantidad) then
          raise exception 'La referencia % tiene una baja vinculada. Revisa esa solicitud antes de cambiar su cantidad',l.codigo;
        end if;
        cambios:=cambios||jsonb_build_array(jsonb_build_object(
          'codigo',l.codigo,'nombre',l.nombre,'imei',l.imei,'producto_id',l.producto_id,
          'cantidad_corte',l.cantidad_corte,'cantidad_anterior',l.cantidad_fisica,'cantidad_nueva',v_cantidad,
          'diferencia_anterior',l.diferencia,'diferencia_nueva',v_cantidad-l.cantidad_corte,
          'nota_anterior',l.nota,'nota_nueva',v_nota));
        update inventario_control.lineas set cantidad_fisica=v_cantidad,esperado_conteo=cantidad_corte,
          diferencia=v_cantidad-cantidad_corte,nota=v_nota where corte_id=c.id and producto_id=l.producto_id and imei=l.imei;
      end if;
    end loop;
    if jsonb_array_length(cambios)>0 then
      v_version:=c.conteo_version+1;
      insert into inventario_control.conteo_correcciones(corte_id,version,creado_por,creado_nombre,motivo,archivo_nombre,archivo_sha256,cambios)
        values(c.id,v_version,p.id,p.nombre,btrim(p_datos->>'motivo'),c.archivo_nombre,c.archivo_sha256,cambios);
      update inventario_control.cortes set conteo_version=v_version where id=c.id;
    end if;
  end if;
  result:=inventario_control.api('ver',jsonb_build_object('id',c.id));
  select coalesce(jsonb_agg(to_jsonb(h) order by h.version),'[]'::jsonb) into historico
    from inventario_control.conteo_correcciones h where corte_id=c.id;
  return result||jsonb_build_object('correcciones',historico,'stock_modificado',false);
end $$;
revoke all on function inventario_control.correcciones_api(text,jsonb) from public,anon;
grant execute on function inventario_control.correcciones_api(text,jsonb) to authenticated;
create function public.inventario_conteo_correcciones(p_accion text,p_datos jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select inventario_control.correcciones_api(p_accion,p_datos);
$$;
revoke all on function public.inventario_conteo_correcciones(text,jsonb) from public,anon;
grant execute on function public.inventario_conteo_correcciones(text,jsonb) to authenticated;

-- El bloqueo del corte protege tanto la corrección como todas las rutas de ajuste.
do $$
declare def text; needle text; replacement text;
begin
  def:=pg_get_functiondef('inventario_control.api(text,jsonb)'::regprocedure);
  needle:=$n$if v_corte.estado<>'pendiente' then raise exception 'Primero registra el conteo referido al corte'; end if;$n$;
  replacement:=needle||$n$
     if coalesce((p_datos->>'conteo_version')::integer,0)<>v_corte.conteo_version then
       raise exception 'El conteo cambió. Vuelve a consultar y revisar las diferencias antes de aplicar el ajuste';
     end if;$n$;
  if strpos(def,needle)=0 then raise exception 'Cambió la validación del ajuste; revisar antes de modificarla'; end if;
  execute replace(def,needle,replacement);
end $$;

-- El documento final incorpora el origen de los datos y todas sus correcciones.
create function inventario_control.documentar_version_conteo() returns trigger
language plpgsql security definer set search_path='' as $$
declare version integer; historico jsonb;
begin
  select conteo_version into version from inventario_control.cortes where id=new.corte_id;
  select coalesce(jsonb_agg(to_jsonb(h) order by h.version),'[]'::jsonb) into historico
    from inventario_control.conteo_correcciones h where corte_id=new.corte_id;
  new.detalle:=new.detalle||jsonb_build_object('conteo_version',version,'correcciones',historico);
  return new;
end $$;
revoke all on function inventario_control.documentar_version_conteo() from public,anon,authenticated;
create trigger ajuste_documento_version_conteo before insert on inventario_control.ajuste_documentos
  for each row execute function inventario_control.documentar_version_conteo();
notify pgrst,'reload schema';
commit;

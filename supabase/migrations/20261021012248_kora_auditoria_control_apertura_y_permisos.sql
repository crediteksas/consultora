-- Preparación local: no aplicar sin revisión y autorización de publicación.
-- Solo reemplaza lógica de funciones. No cierra cortes ni cambia existencias.
begin;

do $migration$
declare
  definition text;
  needle text := $old$ if p_accion='crear' then$old$;
  replacement text := $new$ if p_accion='crear' then
   if not v_autoriza then
     raise exception 'Solo Mayte u Óscar pueden inicializar inventarios. Solicita la apertura del corte; podrás cargar y editar su conteo sin ajustar existencias';
   end if;$new$;
begin
  definition := pg_get_functiondef('inventario_control.api(text,jsonb)'::regprocedure);
  if position(replacement in definition)=0 then
    if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
      raise exception 'La función de inventario cambió: revisar antes de instalar el control de apertura';
    end if;
    execute replace(definition,needle,replacement);
  end if;

  definition := pg_get_functiondef('public.abrir_sesion_conteo_cruzado(text,uuid,integer)'::regprocedure);
  needle := $old$if not es_central() then$old$;
  replacement := $new$if not exists (
    select 1 from public.perfiles p
    join inventario_control.responsables r on r.perfil_id=p.id
    where p.id=auth.uid() and p.activo=true and p.rol in ('gerencia','auditoria')
  ) then$new$;
  if position(replacement in definition)=0 then
    if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
      raise exception 'La función de apertura ciega cambió: revisar antes de instalar el permiso';
    end if;
    definition := replace(definition,needle,replacement);
    definition := replace(definition,'Solo gerencia o auditoría pueden abrir sesiones de conteo cruzado',
      'Solo Mayte u Óscar pueden autorizar la apertura de conteos cruzados');
    execute definition;
  end if;
end;
$migration$;

create or replace function public.registrar_conteo_bloque(p_bloque_id uuid,p_contado integer)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_bloque public.conteos_bloque%rowtype;
  v_sesion public.sesiones_conteo_cruzado%rowtype;
  v_perfil public.perfiles%rowtype;
  v_nuevo_estado text;
begin
  select * into v_perfil from public.perfiles where id=auth.uid() and activo=true;
  if not found or v_perfil.rol not in ('gerencia','auditoria','admin_tienda') or v_perfil.rol is null then
    raise exception 'Sesión sin perfil activo autorizado para contar';
  end if;
  if p_contado is null or p_contado<0 then raise exception 'El conteo debe ser un entero no negativo'; end if;

  -- Serializa intentos sobre el mismo bloque; no permite saltar el máximo de dos.
  select * into v_bloque from public.conteos_bloque where id=p_bloque_id for update;
  if not found then raise exception 'Bloque no encontrado'; end if;
  select * into v_sesion from public.sesiones_conteo_cruzado where id=v_bloque.sesion_id for update;
  if not found or v_sesion.estado is distinct from 'abierta' or v_sesion.vigencia_hasta is null
     or v_sesion.vigencia_hasta<=clock_timestamp() then
    raise exception 'La sesión ya está cerrada o expirada';
  end if;
  if v_perfil.rol='admin_tienda' and auth.uid() is distinct from v_sesion.admin_autorizado then
    raise exception 'No estás autorizado para contar esta tienda';
  end if;
  if v_bloque.estado in ('cerrado_ok','cerrado_con_ajuste','escalado_mayte') then
    raise exception 'Este bloque ya está cerrado o escalado';
  end if;
  if v_bloque.intentos_conteo>=2 then raise exception 'Máximo 2 intentos — el bloque debe escalar a central'; end if;

  v_nuevo_estado := case when p_contado=v_bloque.esperado then 'cerrado_ok'
    when v_bloque.intentos_conteo=0 then 'no_cuadra_1' else 'escalado_mayte' end;
  update public.conteos_bloque set contado=p_contado,intentos_conteo=intentos_conteo+1,estado=v_nuevo_estado,
    cerrado_por=case when v_nuevo_estado='cerrado_ok' then auth.uid() else cerrado_por end,
    cerrado_en=case when v_nuevo_estado='cerrado_ok' then clock_timestamp() else cerrado_en end
  where id=p_bloque_id;
  return jsonb_build_object('estado',v_nuevo_estado,'cuadra',p_contado=v_bloque.esperado,'intento',v_bloque.intentos_conteo+1);
end;
$function$;

revoke all on function public.registrar_conteo_bloque(uuid,integer) from public,anon;
grant execute on function public.registrar_conteo_bloque(uuid,integer) to authenticated;
commit;

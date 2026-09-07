-- Vincular no equivale a justificar. Ningún importe, aprobación o pago se modifica.
create schema if not exists kora_private;
create function kora_private.clave_comercio(p_text text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(translate(lower(coalesce(p_text,'')),
    'áéíóúüñàèìòùâêîôûäëïöç','aeiouunaeiouaeiouaeioc'),'[^a-z0-9]+',' ','g'));
$$;
revoke all on function kora_private.clave_comercio(text) from public,anon,authenticated;

create function kora_private.vincular_comercio_liquidacion(
  p_operation_id uuid, p_origen_codigo text, p_nuevo jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare op public.liquidation_operations%rowtype; lote public.liquidations%rowtype;
  origen public.origenes%rowtype; v_lote uuid; v_nombre text; v_ciudad text;
  v_key text; v_name_key text; v_creado boolean:=false; v_incidentes jsonb;
begin
  if auth.uid() is null or not coalesce(public.tiene_capacidad_aliados('revisor'),false) then
    raise exception 'No autorizado para vincular comercios';
  end if;
  -- Mismo orden de bloqueo que el cálculo/aprobación: lote, operación, origen.
  select liquidation_id into v_lote from public.liquidation_operations where id=p_operation_id;
  select * into lote from public.liquidations where id=v_lote for update;
  if not found then raise exception 'Operación no encontrada'; end if;
  if lote.estado not in ('importada','validada','con_novedades') or lote.frozen_at is not null
    or lote.approved_at is not null or lote.approved_by is not null
    or exists(select 1 from public.liquidation_approvals where liquidation_id=v_lote and etapa='aprobacion' and decision='aprobada')
    or exists(select 1 from public.payment_orders where liquidation_id=v_lote)
    or exists(select 1 from public.liquidation_calculations where liquidation_id=v_lote) then
    raise exception 'Solo se vinculan comercios antes de calcular o aprobar el lote. No se cambiaron pagos';
  end if;
  select * into op from public.liquidation_operations where id=p_operation_id for update;
  if op.origen_codigo is not null and op.tipo_establecimiento in ('propia','aliado') then
    if p_nuevo is null and op.origen_codigo=p_origen_codigo then
      return jsonb_build_object('ok',true,'ya_vinculado',true,'origen_codigo',op.origen_codigo,'tipo',op.tipo_establecimiento);
    end if;
    raise exception 'La operación ya tiene un comercio vinculado. Actualiza antes de continuar';
  end if;
  if (nullif(btrim(p_origen_codigo),'') is null) = (p_nuevo is null) then
    raise exception 'Selecciona un comercio existente o registra un aliado nuevo, no ambos';
  end if;
  perform pg_advisory_xact_lock(hashtext('liquidaciones_vincular_comercio'));
  v_key:=kora_private.clave_comercio(op.establishment_name);
  if v_key='' then raise exception 'La operación no informa el nombre del comercio'; end if;
  if p_nuevo is not null then
    if jsonb_typeof(p_nuevo) is distinct from 'object' or exists(
      select 1 from jsonb_object_keys(p_nuevo) k where k not in ('nombre','ciudad','ejecutivo_id')) then
      raise exception 'Datos del nuevo aliado inválidos';
    end if;
    v_nombre:=btrim(p_nuevo->>'nombre'); v_ciudad:=btrim(p_nuevo->>'ciudad');
    if length(coalesce(v_nombre,'')) not between 3 and 180 or length(coalesce(v_ciudad,'')) not between 2 and 120 then
      raise exception 'Completa el nombre y la ciudad del nuevo local';
    end if;
    perform 1 from public.ejecutivos where id=(p_nuevo->>'ejecutivo_id')::uuid and activo for share;
    if not found then raise exception 'Selecciona el ejecutivo Creditek responsable; no el vendedor de la plataforma'; end if;
    v_name_key:=kora_private.clave_comercio(v_nombre);
    if v_name_key='' then raise exception 'Nombre del comercio inválido'; end if;
    if exists(select 1 from public.origenes o where exists(
      select 1 from jsonb_array_elements_text(coalesce(o.aliases,'[]') || jsonb_build_array(o.nombre,o.codigo)) a
      where kora_private.clave_comercio(a) in (v_key,v_name_key))) then
      raise exception 'Este comercio ya figura en el catálogo. Vincúlalo al existente; no crees un duplicado';
    end if;
    insert into public.origenes(codigo,nombre,tipo,ciudad,ejecutivo_id,activo,aliases)
      values('ALIADO-'||upper(gen_random_uuid()::text),v_nombre,'aliado',v_ciudad,(p_nuevo->>'ejecutivo_id')::uuid,true,
        jsonb_build_array(op.establishment_name)) returning * into origen;
    -- El trigger existente crea la ficha única y su sede, sin inventar titular/cuenta.
    v_creado:=true;
  else
    select * into origen from public.origenes where codigo=p_origen_codigo and activo and tipo in ('propia','aliado') for update;
    if not found then raise exception 'Selecciona una tienda propia o aliado activo'; end if;
    if exists(select 1 from public.origenes o where o.codigo<>origen.codigo and exists(
      select 1 from jsonb_array_elements_text(coalesce(o.aliases,'[]') || jsonb_build_array(o.nombre,o.codigo)) a
      where kora_private.clave_comercio(a)=v_key)) then
      raise exception 'El nombre del archivo también pertenece a otro comercio. Revisa la identidad antes de vincular';
    end if;
    if not exists(select 1 from jsonb_array_elements_text(origen.aliases || jsonb_build_array(origen.nombre,origen.codigo)) a
      where kora_private.clave_comercio(a)=v_key) then
      update public.origenes set aliases=aliases || jsonb_build_array(op.establishment_name)
        where codigo=origen.codigo returning * into origen;
    end if;
  end if;
  if origen.tipo='aliado' and not exists(select 1 from public.aliados_sedes where origen_codigo=origen.codigo) then
    -- Activa el mismo sincronizador de ficha, sin otro escritor de clientes.
    update public.origenes set activo=true where codigo=origen.codigo;
  end if;
  update public.liquidation_operations set origen_codigo=origen.codigo,tipo_establecimiento=origen.tipo,
    ejecutivo_id=origen.ejecutivo_id,normalized_data=normalized_data || jsonb_build_object(
      'establecimiento',jsonb_build_object('codigo',origen.codigo,'nombre',origen.nombre,'tipo',origen.tipo,'ejecutivo_id',origen.ejecutivo_id),
      'tipoEstablecimiento',origen.tipo,
      'ejecutivo',(select jsonb_build_object('id',id,'nombre',nombre) from public.ejecutivos where id=origen.ejecutivo_id),
      'incidencias',coalesce((select jsonb_agg(i) from jsonb_array_elements_text(coalesce(normalized_data->'incidencias','[]')) i
        where i not in ('comercio_no_reconocido','comercio_ambiguo')),'[]'::jsonb))
    where id=op.id;
  select coalesce(jsonb_agg(to_jsonb(i)),'[]') into v_incidentes from public.liquidation_incidents i
    where operation_id=op.id and tipo in ('comercio_no_reconocido','comercio_ambiguo');
  update public.liquidation_incidents set estado='resuelta',resolution='Comercio vinculado: '||origen.nombre||' ('||origen.codigo||')',
    resolved_by=auth.uid(),resolved_at=now()
    where operation_id=op.id and tipo in ('comercio_no_reconocido','comercio_ambiguo') and estado='abierta';
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid(),'liquidacion_comercio_vinculado','liquidation_operations',op.id,
      jsonb_build_object('liquidation_id',v_lote,'nombre_archivo',op.establishment_name,'origen_anterior',op.origen_codigo,
        'tipo_anterior',op.tipo_establecimiento,'origen_codigo',origen.codigo,'tipo',origen.tipo,'creado',v_creado,
        'incidentes_antes',v_incidentes,'sin_cambio_financiero',true));
  return jsonb_build_object('ok',true,'origen_codigo',origen.codigo,'nombre',origen.nombre,'tipo',origen.tipo,'creado',v_creado);
end $$;
revoke all on function kora_private.vincular_comercio_liquidacion(uuid,text,jsonb) from public,anon,authenticated;
grant usage on schema kora_private to authenticated;
grant execute on function kora_private.vincular_comercio_liquidacion(uuid,text,jsonb) to authenticated;
create function public.aliados_vincular_comercio(p_operation_id uuid,p_origen_codigo text default null,p_nuevo jsonb default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select kora_private.vincular_comercio_liquidacion(p_operation_id,p_origen_codigo,p_nuevo);
$$;
revoke all on function public.aliados_vincular_comercio(uuid,text,jsonb) from public,anon;
grant execute on function public.aliados_vincular_comercio(uuid,text,jsonb) to authenticated;

-- También protege clientes antiguos que todavía muestran “Revisar y justificar”.
create function kora_private.exigir_comercio_vinculado() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo in ('comercio_no_reconocido','comercio_ambiguo') and new.estado<>'abierta'
    and not exists(select 1 from public.liquidation_operations op join public.origenes o on o.codigo=op.origen_codigo
      where op.id=new.operation_id and op.liquidation_id=new.liquidation_id and o.activo
      and o.tipo in ('propia','aliado') and op.tipo_establecimiento=o.tipo) then
    raise exception 'Primero vincula el comercio existente o registra el nuevo aliado. Una justificación no crea el cliente ni su cuenta';
  end if;
  return new;
end $$;
revoke all on function kora_private.exigir_comercio_vinculado() from public,anon,authenticated;
create trigger exigir_comercio_vinculado before insert or update on public.liquidation_incidents
for each row execute function kora_private.exigir_comercio_vinculado();

-- Reabre solo falsas resoluciones en borradores sin cálculo/pagos. Conserva
-- la justificación y su autor en auditoría; no toca lotes históricos ni importes.
do $$
declare i record;
begin
  for i in select inc.* from public.liquidation_incidents inc
    join public.liquidation_operations op on op.id=inc.operation_id
    join public.liquidations l on l.id=inc.liquidation_id
    where inc.tipo in ('comercio_no_reconocido','comercio_ambiguo') and inc.estado='resuelta'
      and (op.origen_codigo is null or op.tipo_establecimiento='no_reconocido')
      and l.estado in ('importada','validada','con_novedades') and l.frozen_at is null
      and l.approved_at is null and l.approved_by is null
      and not exists(select 1 from public.liquidation_approvals where liquidation_id=l.id and etapa='aprobacion' and decision='aprobada')
      and not exists(select 1 from public.payment_orders where liquidation_id=l.id)
      and not exists(select 1 from public.liquidation_calculations where liquidation_id=l.id)
    for update of inc loop
    insert into public.audit_log(accion,tabla,registro_id,detalle)
      values('comercio_resolucion_sin_vinculo_reabierta','liquidation_incidents',i.id,
        jsonb_build_object('antes',to_jsonb(i),'motivo','La justificación no vinculó el comercio','sin_cambio_financiero',true));
    update public.liquidation_incidents set estado='abierta',resolution=null,resolved_by=null,resolved_at=null where id=i.id;
  end loop;
end $$;

-- Formaliza para operación los comercios Krediya ya asociados históricamente
-- y reconoce las variantes UNO/DOS usadas por las tiendas propias.
do $$
declare
  v_alexander uuid;
  v_insertados integer;
  v_reconocidos integer;
begin
  select id into v_alexander
  from public.ejecutivos
  where activo and lower(unaccent(btrim(nombre)))='alexander fernandez'
  order by id limit 1;

  if v_alexander is null then
    raise exception 'Alexander Fernandez no existe o está inactivo';
  end if;

  insert into public.origenes(codigo,nombre,tipo,ejecutivo_id,activo,aliases)
  select
    'ALIADO-KREDIYA-'||upper(substr(md5(s.establecimiento),1,12)),
    regexp_replace(btrim(s.establecimiento),'^A[[:space:]]+','','i'),
    'aliado',
    v_alexander,
    true,
    jsonb_build_array(s.establecimiento)
  from (
    select distinct btrim(h.establecimiento) establecimiento
    from public.creditos_historicos_plataforma h
    where h.tipo_establecimiento='aliado'
      and h.ejecutivo_historico_id=v_alexander
      and h.establecimiento ~* '^A[[:space:]]+'
  ) s
  where not exists (
    select 1 from public.origenes o
    where lower(unaccent(btrim(o.nombre)))=lower(unaccent(btrim(regexp_replace(s.establecimiento,'^A[[:space:]]+','','i'))))
       or coalesce(o.aliases,'[]'::jsonb) @> jsonb_build_array(s.establecimiento)
  );
  get diagnostics v_insertados=row_count;

  update public.origenes set aliases=coalesce(aliases,'[]'::jsonb)||jsonb_build_array(v.alias)
  from (values
    ('CK-01','CREDITEK TOLU'),
    ('CK-05','CREDITEK CHINU UNO'),
    ('CK-06','CREDITEK CHINU DOS'),
    ('CK-08','CREDITEK CIENAGA DE ORO UNO'),
    ('CK-02','CREDITEK COROZAL UNO')
  ) v(codigo,alias)
  where public.origenes.codigo=v.codigo
    and not coalesce(public.origenes.aliases,'[]'::jsonb) @> jsonb_build_array(v.alias);

  with matches as (
    select distinct on (op.id) op.id operation_id,o.codigo,o.tipo,o.ejecutivo_id,o.nombre
    from public.liquidation_operations op
    join public.origenes o on o.activo and (
      lower(unaccent(btrim(op.establishment_name)))=lower(unaccent(btrim(o.nombre)))
      or exists (
        select 1 from jsonb_array_elements_text(coalesce(o.aliases,'[]'::jsonb)) a(alias)
        where lower(unaccent(btrim(a.alias)))=lower(unaccent(btrim(op.establishment_name)))
      )
    )
    where op.plataforma='krediya'
      and not op.reconocida
      and lower(coalesce(op.normalized_data#>>'{movimientos,0,original,Estado del contrato}',op.normalized_data#>>'{movimientos,0,original,estado del contrato}',''))='firmado'
    order by op.id,o.codigo
  )
  update public.liquidation_operations op set
    origen_codigo=m.codigo,
    tipo_establecimiento=m.tipo,
    ejecutivo_id=m.ejecutivo_id,
    reconocida=true,
    normalized_data=(coalesce(op.normalized_data,'{}'::jsonb)
      - 'incidencias')||jsonb_build_object(
        'reconocida',true,
        'tipoEstablecimiento',m.tipo,
        'establecimiento',jsonb_build_object('codigo',m.codigo,'nombre',m.nombre,'tipo',m.tipo,'ejecutivo_id',m.ejecutivo_id),
        'incidencias','[]'::jsonb
      )
  from matches m where op.id=m.operation_id;
  get diagnostics v_reconocidos=row_count;

  update public.liquidation_incidents i set
    estado='resuelta',
    resolution='Comercio formalizado y vinculado al maestro operativo',
    resolved_at=now()
  where i.estado='abierta' and i.tipo='comercio_no_reconocido'
    and exists(select 1 from public.liquidation_operations op where op.id=i.operation_id and op.reconocida);

  insert into public.audit_log(usuario,accion,tabla,detalle)
  values(null,'formalizar_comercios_krediya','origenes',jsonb_build_object(
    'comercios_insertados',v_insertados,
    'operaciones_reconocidas',v_reconocidos,
    'criterio','asociación histórica aprobada y alias exactos de tiendas propias',
    'fecha',now()
  ));
end $$;

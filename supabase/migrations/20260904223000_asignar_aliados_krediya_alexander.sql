-- Decisión expresa de Gerencia: estos tres comercios Krediya pertenecen a
-- Alexander Fernández. Las operaciones anuladas se conservan, pero no se liquidan.
do $$
declare
  v_alexander uuid;
  v_reconocidas integer;
begin
  select id into v_alexander
  from public.ejecutivos
  where activo and lower(unaccent(btrim(nombre)))='alexander fernandez'
  order by id limit 1;

  if v_alexander is null then
    raise exception 'Alexander Fernandez no existe o está inactivo';
  end if;

  insert into public.origenes(codigo,nombre,tipo,ejecutivo_id,activo,aliases)
  select v.codigo,v.nombre,'aliado',v_alexander,true,jsonb_build_array(v.alias)
  from (values
    ('ALIADO-KREDIYA-BETEL','BETEL SA CREDITOS','A BETEL SA CREDITOS'),
    ('ALIADO-KREDIYA-DIGI-CANTACLARO','DIGI MOVIL CANTACLARO','A DIGI MOVIL CANTACLARO'),
    ('ALIADO-KREDIYA-DIGI-GRANJA','DIGI MOVIL GRANJA','A DIGI MOVIL GRANJA')
  ) v(codigo,nombre,alias)
  on conflict(codigo) do update set
    nombre=excluded.nombre,
    tipo='aliado',
    ejecutivo_id=v_alexander,
    activo=true,
    aliases=case
      when coalesce(public.origenes.aliases,'[]'::jsonb) @> excluded.aliases then public.origenes.aliases
      else coalesce(public.origenes.aliases,'[]'::jsonb)||excluded.aliases
    end;

  with mapping(establishment_name,codigo) as (values
    ('A BETEL SA CREDITOS','ALIADO-KREDIYA-BETEL'),
    ('A DIGI MOVIL CANTACLARO','ALIADO-KREDIYA-DIGI-CANTACLARO'),
    ('A DIGI MOVIL GRANJA','ALIADO-KREDIYA-DIGI-GRANJA')
  )
  update public.liquidation_operations op set
    origen_codigo=m.codigo,
    tipo_establecimiento='aliado',
    ejecutivo_id=v_alexander,
    reconocida=true,
    normalized_data=(coalesce(op.normalized_data,'{}'::jsonb)-'incidencias')||jsonb_build_object(
      'reconocida',true,
      'tipoEstablecimiento','aliado',
      'incidencias','[]'::jsonb
    )
  from mapping m
  where op.plataforma='krediya'
    and op.establishment_name=m.establishment_name
    and lower(coalesce(op.normalized_data#>>'{movimientos,0,original,estado del contrato}',
                       op.normalized_data#>>'{movimientos,0,original,__original,Estado del contrato}',''))='firmado';
  get diagnostics v_reconocidas=row_count;

  update public.liquidation_incidents i set
    estado='resuelta',resolution='Aliado asignado a Alexander Fernández por decisión de Gerencia',resolved_at=now()
  where i.estado='abierta' and i.tipo='comercio_no_reconocido'
    and exists(select 1 from public.liquidation_operations op where op.id=i.operation_id and op.reconocida);

  update public.liquidation_incidents i set
    estado='resuelta',resolution='Operación anulada en el archivo fuente; excluida de la liquidación',resolved_at=now()
  where i.estado='abierta' and i.tipo in('comercio_no_reconocido','operacion_no_reconocida')
    and exists(
      select 1 from public.liquidation_operations op
      where op.id=i.operation_id and op.plataforma='krediya'
        and lower(coalesce(op.normalized_data#>>'{movimientos,0,original,estado del contrato}',
                           op.normalized_data#>>'{movimientos,0,original,__original,Estado del contrato}',''))='anulado'
    );

  insert into public.audit_log(usuario,accion,tabla,detalle)
  values(null,'asignar_aliados_krediya_alexander','origenes',jsonb_build_object(
    'aliados',jsonb_build_array('BETEL SA CREDITOS','DIGI MOVIL CANTACLARO','DIGI MOVIL GRANJA'),
    'operaciones_reconocidas',v_reconocidas,
    'operaciones_anuladas_excluidas',2,
    'origen_decision','confirmación expresa de Gerencia',
    'fecha',now()
  ));
end $$;

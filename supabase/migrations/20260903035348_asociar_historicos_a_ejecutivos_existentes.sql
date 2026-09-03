-- Vincula únicamente establecimientos históricos cuya identidad coincide de
-- forma inequívoca con un origen aliado que ya tiene ejecutivo Creditek.
-- No se usa el nombre del vendedor del comercio como ejecutivo.
do $$
declare
  v_asociados integer;
begin
  with alias(establecimiento_historico, origen_codigo) as (
    values
      ('A ALFHAVERSO TECHNOLOGY', 'ALIADO-ALFHAVERSO-TECHNOLOGY-FSUXIRXM'),
      ('A CELLUXE TEC', 'celluxe-tech'),
      ('ALIADO CLUB SEVEN BM', 'club-seven'),
      ('ALIADO DISTRITOYS BARRANQUILLA', 'distritoys'),
      ('ALIADO INNOVACEL COMUNICACIONES SAS', 'innovacel'),
      ('Artesanias eileen', 'artesanias-eileen'),
      ('ARTESANIAS EILEEN ALIADA', 'artesanias-eileen'),
      ('Celutodo.net', 'ALIADO-CELUTODO-NET-YKUT76KK'),
      ('Distritoys ', 'distritoys'),
      ('Gangacell Galapa', 'ALIADO-GANGACELL-GALAPA-VABOWYFD'),
      ('MovilPlus.', 'ALIADO-MOVILPLUS-BEX8ALXW')
  ), asociaciones as (
    select a.establecimiento_historico, o.ejecutivo_id, o.codigo
      from alias a
      join public.origenes o on lower(o.codigo) = lower(a.origen_codigo)
     where o.tipo = 'aliado'
       and o.ejecutivo_id is not null
  )
  update public.creditos_historicos_plataforma h
     set ejecutivo_historico_id = a.ejecutivo_id,
         actualizado_at = now(),
         politica_historica_snapshot = coalesce(h.politica_historica_snapshot, '{}'::jsonb)
           || jsonb_build_object(
             'ejecutivo_asociado', a.ejecutivo_id,
             'origen_asociado', a.codigo,
             'metodo_asociacion', 'alias_establecimiento_validado',
             'asociado_at', now()
           )
    from asociaciones a
   where h.historico_inicial is true
     and h.tipo_establecimiento = 'aliado'
     and h.ejecutivo_historico_id is null
     and h.establecimiento = a.establecimiento_historico;

  get diagnostics v_asociados = row_count;

  if v_asociados <> 118 then
    raise exception 'Se esperaban 118 créditos históricos asociables y se asociaron %', v_asociados;
  end if;

  insert into public.audit_log(usuario, accion, tabla, detalle)
  values (
    null,
    'aliados_historicos_asociados_automaticamente',
    'creditos_historicos_plataforma',
    jsonb_build_object(
      'creditos_asociados', v_asociados,
      'criterio', 'alias de establecimiento validado contra origen con ejecutivo',
      'fecha', now()
    )
  );
end $$;

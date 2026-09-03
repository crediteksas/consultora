-- Regla confirmada por gerencia: los establecimientos históricos cuyo nombre
-- comienza con "A " pertenecen al ejecutivo Alexander Fernández.
do $$
declare
  v_ejecutivo_id uuid;
  v_creditos integer;
begin
  select id
    into v_ejecutivo_id
    from public.ejecutivos
   where lower(unaccent(trim(nombre))) = 'alexander fernandez'
     and activo
   order by id
   limit 1;

  if v_ejecutivo_id is null then
    raise exception 'Alexander Fernández no existe o está inactivo';
  end if;

  update public.creditos_historicos_plataforma
     set ejecutivo_historico_id = v_ejecutivo_id,
         actualizado_at = now(),
         politica_historica_snapshot = coalesce(politica_historica_snapshot, '{}'::jsonb)
           || jsonb_build_object(
             'ejecutivo_asociado', v_ejecutivo_id,
             'metodo_asociacion', 'regla_prefijo_a_confirmada_por_gerencia',
             'asociado_at', now()
           )
   where historico_inicial is true
     and tipo_establecimiento = 'aliado'
     and ejecutivo_historico_id is null
     and establecimiento ~* '^A[[:space:]]+';

  get diagnostics v_creditos = row_count;

  if v_creditos <> 20 then
    raise exception 'Se esperaban 20 créditos con prefijo A pendientes y se asociaron %', v_creditos;
  end if;

  insert into public.audit_log(usuario, accion, tabla, detalle)
  values (
    null,
    'aliados_historicos_regla_prefijo_a',
    'creditos_historicos_plataforma',
    jsonb_build_object(
      'ejecutivo_id', v_ejecutivo_id,
      'ejecutivo', 'Alexander Fernandez',
      'creditos_asociados', v_creditos,
      'regla', 'establecimiento inicia con A ',
      'origen_decision', 'gerencia',
      'fecha', now()
    )
  );
end $$;

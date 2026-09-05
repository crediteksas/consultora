-- SONIVOX (CK-07) es una tienda propia de Creditek Retail. Un único crédito
-- histórico PayJoy quedó clasificado como aliado durante la carga inicial.
do $$
declare
  v_credito_id uuid;
  v_afectados integer;
begin
  if not exists (
    select 1
      from public.origenes
     where codigo = 'CK-07'
       and tipo = 'propia'
       and lower(unaccent(btrim(nombre))) = 'sonivox'
  ) then
    raise exception 'CK-07 no está catalogada como tienda propia Sonivox';
  end if;

  select id
    into v_credito_id
    from public.creditos_historicos_plataforma
   where plataforma = 'payjoy'
     and codigo_credito = 'DKJZFJC'
     and lower(unaccent(btrim(establecimiento))) = 'sonivox'
   for update;

  if v_credito_id is null then
    raise exception 'No se encontró el crédito histórico de Sonivox';
  end if;

  update public.creditos_historicos_plataforma
     set tipo_establecimiento = 'propia',
         ejecutivo_historico_id = null,
         pagamos_historico = round(valor_comercial_historico * 0.76, 2),
         pago_neto_historico = greatest(
           0,
           round(valor_comercial_historico * 0.76 - coalesce(cuota_inicial, 0), 2)
         ),
         bonos_historicos = 0,
         utilidad_antes_bonos_historica = round(
           valor_comercial_historico - valor_comercial_historico * 0.76,
           2
         ),
         utilidad_neta_historica = round(
           valor_comercial_historico - valor_comercial_historico * 0.76,
           2
         ),
         resultado_cerrado_historico = case
           when cierre_utilidad_at is not null then round(
             valor_comercial_historico - valor_comercial_historico * 0.76,
             2
           )
           else resultado_cerrado_historico
         end,
         calculo_historico_estado = 'calculado_reclasificado_retail',
         politica_historica_snapshot =
           (coalesce(politica_historica_snapshot, '{}'::jsonb)
             - 'ejecutivo_asociado'
             - 'bono_ejecutivo_asociado')
           || jsonb_build_object(
             'tipo_establecimiento', 'propia',
             'origen_codigo', 'CK-07',
             'porcentaje', 0.76,
             'bonos', 'no_aplica_retail',
             'reclasificada_el', now(),
             'motivo_reclasificacion', 'Sonivox pertenece a Creditek Retail'
           ),
         datos_origen = coalesce(datos_origen, '{}'::jsonb)
           || jsonb_build_object(
             'clasificacion_kora', 'tienda_propia',
             'origen_codigo', 'CK-07',
             'reclasificada_el', now()
           ),
         actualizado_at = now()
   where id = v_credito_id;

  get diagnostics v_afectados = row_count;
  if v_afectados <> 1 then
    raise exception 'Se esperaba corregir 1 crédito de Sonivox y se corrigieron %', v_afectados;
  end if;

  update public.aliados_cierres_utilidad c
     set resultado_historico_cerrado = resumen.total
    from (
      select round(coalesce(sum(resultado_cerrado_historico), 0), 2) as total
        from public.creditos_historicos_plataforma
       where fecha_credito < timestamptz '2026-09-02 00:00:00-05'
    ) resumen
   where c.fecha_corte = timestamptz '2026-09-02 00:00:00-05';

  insert into public.audit_log(usuario, accion, tabla, registro_id, detalle)
  values (
    null,
    'historico_reclasificado_retail',
    'creditos_historicos_plataforma',
    v_credito_id,
    jsonb_build_object(
      'plataforma', 'payjoy',
      'codigo_credito', 'DKJZFJC',
      'establecimiento', 'SONIVOX',
      'origen_codigo', 'CK-07',
      'clasificacion_anterior', 'aliado',
      'clasificacion_nueva', 'propia'
    )
  );
end $$;

create or replace function public.aliados_asociar_historico(
  p_establecimiento text,
  p_ejecutivo_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if not public.tiene_capacidad_aliados('revisor') then
    raise exception 'No autorizado para asociar históricos de Aliados';
  end if;
  if not exists (
    select 1 from public.ejecutivos where id = p_ejecutivo_id and activo
  ) then
    raise exception 'El ejecutivo no existe o está inactivo';
  end if;
  if exists (
    select 1
      from public.origenes o
     where o.tipo = 'propia'
       and (
         lower(unaccent(btrim(o.nombre))) = lower(unaccent(btrim(p_establecimiento)))
         or exists (
           select 1
             from jsonb_array_elements_text(coalesce(o.aliases, '[]'::jsonb)) alias(valor)
            where lower(unaccent(btrim(alias.valor))) = lower(unaccent(btrim(p_establecimiento)))
         )
       )
  ) then
    raise exception 'El establecimiento pertenece a Creditek Retail y no admite ejecutivo de Aliados';
  end if;

  update public.creditos_historicos_plataforma
     set ejecutivo_historico_id = p_ejecutivo_id,
         calculo_historico_estado = 'calculado_con_bonos',
         actualizado_at = now(),
         politica_historica_snapshot = coalesce(politica_historica_snapshot, '{}'::jsonb)
           || jsonb_build_object(
             'ejecutivo_asociado', p_ejecutivo_id,
             'asociado_at', now()
           )
   where historico_inicial is true
     and tipo_establecimiento = 'aliado'
     and establecimiento = p_establecimiento;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'No se encontraron créditos para asociar';
  end if;

  insert into public.audit_log(usuario, accion, tabla, detalle)
  values (
    auth.uid(),
    'aliados_historico_asociado',
    'creditos_historicos_plataforma',
    jsonb_build_object(
      'establecimiento', p_establecimiento,
      'ejecutivo_id', p_ejecutivo_id,
      'creditos', v_count
    )
  );
  return v_count;
end $$;

revoke all on function public.aliados_asociar_historico(text, uuid) from public, anon;
grant execute on function public.aliados_asociar_historico(text, uuid) to authenticated;

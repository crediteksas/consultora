begin;

alter table public.aliados_metas_plataforma
  add column if not exists updated_by uuid references public.perfiles(id);

create or replace function public.aliados_guardar_meta_plataforma(
  p_plataforma text,
  p_periodo_desde date,
  p_periodo_hasta date,
  p_meta_creditos integer,
  p_incentivo_base numeric,
  p_valor_credito_adicional numeric,
  p_fpd7_max_pct numeric default null,
  p_fuente text default 'Registro de Gerencia',
  p_fuente_referencia text default null,
  p_notas text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null or not public.tiene_capacidad_aliados('aprobador') then
    raise exception 'Solo Gerencia puede crear o modificar metas de plataformas';
  end if;
  if p_plataforma not in ('payjoy','alo','krediya','ecredit') then
    raise exception 'Plataforma no admitida';
  end if;
  if p_periodo_desde is null or p_periodo_hasta is null or p_periodo_hasta < p_periodo_desde then
    raise exception 'El periodo de la meta no es válido';
  end if;
  if coalesce(p_meta_creditos,0) <= 0 then
    raise exception 'La meta de créditos debe ser mayor que cero';
  end if;
  if coalesce(p_incentivo_base,0) < 0 or coalesce(p_valor_credito_adicional,0) < 0 then
    raise exception 'Los incentivos no pueden ser negativos';
  end if;
  if p_fpd7_max_pct is not null and (p_fpd7_max_pct < 0 or p_fpd7_max_pct > 100) then
    raise exception 'FPD7 debe estar entre 0 y 100';
  end if;

  insert into public.aliados_metas_plataforma (
    plataforma, periodo_desde, periodo_hasta, meta_creditos, incentivo_base,
    valor_credito_adicional, fpd7_max_pct, estado, fuente, fuente_referencia,
    notas, created_by, updated_by, updated_at
  ) values (
    p_plataforma, p_periodo_desde, p_periodo_hasta, p_meta_creditos,
    coalesce(p_incentivo_base,0), coalesce(p_valor_credito_adicional,0),
    p_fpd7_max_pct, 'vigente', trim(p_fuente), nullif(trim(p_fuente_referencia),''),
    nullif(trim(p_notas),''), auth.uid(), auth.uid(), now()
  )
  on conflict (plataforma, periodo_desde, periodo_hasta) do update set
    meta_creditos=excluded.meta_creditos,
    incentivo_base=excluded.incentivo_base,
    valor_credito_adicional=excluded.valor_credito_adicional,
    fpd7_max_pct=excluded.fpd7_max_pct,
    estado='vigente',
    fuente=excluded.fuente,
    fuente_referencia=excluded.fuente_referencia,
    notas=excluded.notas,
    updated_by=auth.uid(),
    updated_at=now()
  returning id into v_id;

  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values (
    auth.uid()::text,
    'guardar_meta_plataforma',
    'aliados_metas_plataforma',
    v_id::text,
    jsonb_build_object(
      'plataforma',p_plataforma,'periodo_desde',p_periodo_desde,
      'periodo_hasta',p_periodo_hasta,'meta_creditos',p_meta_creditos,
      'incentivo_base',coalesce(p_incentivo_base,0),
      'valor_credito_adicional',coalesce(p_valor_credito_adicional,0),
      'fpd7_max_pct',p_fpd7_max_pct
    )
  );

  return v_id;
end;
$$;

revoke all on function public.aliados_guardar_meta_plataforma(text,date,date,integer,numeric,numeric,numeric,text,text,text) from public, anon;
grant execute on function public.aliados_guardar_meta_plataforma(text,date,date,integer,numeric,numeric,numeric,text,text,text) to authenticated;

commit;

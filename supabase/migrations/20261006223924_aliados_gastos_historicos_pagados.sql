-- Regularizar gastos de Aliados YA PAGADOS, con autorización real de Gerencia.
-- No genera pagos, movimientos de Tesorería/Banco/caja ni altera cierres previos.
alter table public.aliados_gastos_operativos
  add column fecha_causacion_historica date,
  add column registro_historico_key text unique,
  add constraint aliados_gastos_historicos_pagados_check check (
    (fecha_causacion_historica is null and registro_historico_key is null)
    or (fecha_causacion_historica is not null and registro_historico_key is not null
      and length(btrim(registro_historico_key)) >= 12
      and fecha = fecha_causacion_historica
      and estado = 'aprobado' and treasury_movement_id is null
      and aprobado_por is not null and aprobado_at is not null
      and fecha_causacion_historica < (aprobado_at at time zone 'America/Bogota')::date)
  );

comment on column public.aliados_gastos_operativos.fecha_causacion_historica is
  'Fecha contable excepcional de un gasto histórico ya pagado. aprobado_at conserva la autorización real; no crea otro pago.';
create index aliados_gastos_causacion_historica_idx
  on public.aliados_gastos_operativos(fecha_causacion_historica)
  where fecha_causacion_historica is not null;

create function kora_private.aliados_registrar_gasto_historico_pagado(
  p_fecha date, p_plataforma text, p_concepto text, p_valor numeric,
  p_motivo text, p_referencia text
) returns public.aliados_gastos_operativos
language plpgsql security definer set search_path = '' as $$
declare
  v public.aliados_gastos_operativos%rowtype;
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists (
    select 1 from public.perfiles p join public.aliados_operadores o on o.perfil_id=p.id
    where p.id=v_actor and p.activo and p.rol='gerencia' and o.activo and o.capacidad='aprobador'
  ) or not public.es_controlador_financiero() then
    raise exception 'Solo Gerencia activa puede regularizar un gasto histórico ya pagado';
  end if;
  if p_fecha is null or p_fecha >= (now() at time zone 'America/Bogota')::date then
    raise exception 'La fecha contable debe ser histórica';
  end if;
  if p_plataforma is null or p_plataforma not in ('payjoy','alo','krediya') then
    raise exception 'Plataforma no válida';
  end if;
  if p_valor is null or p_valor::text in ('NaN','Infinity','-Infinity')
     or p_valor <= 0 or p_valor <> round(p_valor,2) then
    raise exception 'Importe histórico no válido';
  end if;
  if length(btrim(coalesce(p_concepto,''))) < 3
    or length(btrim(coalesce(p_motivo,''))) < 20
    or length(btrim(coalesce(p_referencia,''))) < 12 then
    raise exception 'Faltan concepto, motivo de autorización o referencia única';
  end if;

  -- Serializa reintentos de la misma referencia. No actualiza registros previos.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(btrim(p_referencia),0));
  select * into v from public.aliados_gastos_operativos
    where registro_historico_key=btrim(p_referencia);
  if found then
    if v.fecha_causacion_historica is distinct from p_fecha
      or v.plataforma is distinct from p_plataforma or v.concepto is distinct from btrim(p_concepto)
      or v.valor is distinct from p_valor or v.aprobado_por is distinct from v_actor
      or v.descripcion is distinct from 'Regularización histórica de gasto ya pagado. Sin nuevo giro ni movimiento de Banco/caja. '||btrim(p_motivo) then
      raise exception 'La referencia ya existe con datos diferentes';
    end if;
    return v;
  end if;

  insert into public.aliados_gastos_operativos(
    fecha,plataforma,concepto,descripcion,valor,estado,registrado_por,
    aprobado_por,aprobado_at,fecha_causacion_historica,registro_historico_key
  ) values (
    p_fecha,p_plataforma,btrim(p_concepto),
    'Regularización histórica de gasto ya pagado. Sin nuevo giro ni movimiento de Banco/caja. '||btrim(p_motivo),
    p_valor,'aprobado',v_actor,v_actor,now(),p_fecha,btrim(p_referencia)
  ) returning * into v;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(v_actor::text,'aliados_gasto_historico_pagado','aliados_gastos_operativos',v.id::text,
      to_jsonb(v)||jsonb_build_object('ya_pagado_declarado',true,'nuevo_pago',false,
        'mueve_banco',false,'mueve_caja',false,'motivo_autorizacion',btrim(p_motivo)));
  return v;
end $$;

create function public.aliados_registrar_gasto_historico_pagado(
  p_fecha date, p_plataforma text, p_concepto text, p_valor numeric,
  p_motivo text, p_referencia text
) returns public.aliados_gastos_operativos
language sql security invoker set search_path = '' as $$
  select kora_private.aliados_registrar_gasto_historico_pagado(
    p_fecha,p_plataforma,p_concepto,p_valor,p_motivo,p_referencia)
$$;

revoke all on function kora_private.aliados_registrar_gasto_historico_pagado(date,text,text,numeric,text,text) from public,anon;
revoke all on function public.aliados_registrar_gasto_historico_pagado(date,text,text,numeric,text,text) from public,anon;
grant execute on function kora_private.aliados_registrar_gasto_historico_pagado(date,text,text,numeric,text,text) to authenticated;
grant execute on function public.aliados_registrar_gasto_historico_pagado(date,text,text,numeric,text,text) to authenticated;

notify pgrst, 'reload schema';

-- Los retiros nuevos parten del último cierre informativo del negocio.
-- No cambia cierres, caja, Banco ni movimientos existentes.
create or replace function kora_private.finanzas_registrar_movimiento(
  p_entry_type text,
  p_business_unit text,
  p_due_date date,
  p_category text,
  p_concept text,
  p_beneficiary text,
  p_beneficiary_document text,
  p_destination_account text,
  p_amount numeric,
  p_source_period_from date default null,
  p_source_period_to date default null,
  p_note text default null
) returns public.financial_entries
language plpgsql security definer set search_path = ''
as $$
declare
  v public.financial_entries%rowtype;
  v_close date;
  v_from date;
  v_to date;
begin
  if not (select public.es_controlador_financiero()) then raise exception 'Solo Maite u Oscar pueden registrar movimientos'; end if;
  if p_entry_type not in ('gasto','retiro_utilidad') then raise exception 'Tipo de movimiento no permitido'; end if;
  if p_business_unit not in ('retail','b2b','aliados') then raise exception 'Negocio no permitido'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'Ingresa un valor válido'; end if;
  v_from:=p_source_period_from;
  v_to:=p_source_period_to;
  if p_entry_type='retiro_utilidad' then
    if p_due_date >= date '2026-10-01' then
      if p_due_date>(now() at time zone 'America/Bogota')::date then raise exception 'No se puede retirar utilidad de una fecha futura'; end if;
      select max(periodo) into v_close
      from public.utilidades_cierres_negocio
      where negocio=p_business_unit and periodo<date_trunc('month',p_due_date)::date;
      if v_close is null then raise exception 'Falta registrar el cierre anterior de utilidad para %',p_business_unit; end if;
      v_from:=(v_close+interval '1 month')::date;
      v_to:=p_due_date;
      if p_source_period_from is not null and p_source_period_from<>v_from
        or p_source_period_to is not null and p_source_period_to<>v_to then
        raise exception 'El período de utilidad cambió. Actualiza la pantalla e intenta de nuevo';
      end if;
    elsif v_from is null or v_to is null or v_from>v_to then
      raise exception 'Selecciona el período de origen de la utilidad';
    end if;
  end if;
  insert into public.financial_entries(
    entry_type,source,scope,business_unit,due_date,category,concept,beneficiary,
    beneficiary_document,destination_account,amount,source_period_from,source_period_to,
    status,note,created_by
  ) values (
    p_entry_type,'manual','business_general',p_business_unit,p_due_date,p_category,btrim(p_concept),btrim(p_beneficiary),
    nullif(btrim(coalesce(p_beneficiary_document,'')),''),nullif(btrim(coalesce(p_destination_account,'')),''),p_amount,
    v_from,v_to,'pendiente_aprobacion',nullif(btrim(coalesce(p_note,'')),''),auth.uid()
  ) returning * into v;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(auth.uid(),'finanzas_movimiento_registrado','financial_entries',v.id,jsonb_build_object('entry_type',v.entry_type,'business_unit',v.business_unit,'amount',v.amount));
  return v;
end
$$;

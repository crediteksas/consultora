CREATE OR REPLACE FUNCTION public.tesoreria_cerrar_pagos_con_soporte(p_ids uuid[], p_soporte_path text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.payment_orders%rowtype; v_first public.payment_orders%rowtype; v_id uuid; v_count integer; v_object record;
begin
  if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para registrar soportes'; end if;
  if coalesce(cardinality(p_ids),0) not between 1 and 50 or array_position(p_ids,null) is not null
    or cardinality(p_ids)<>(select count(distinct id) from unnest(p_ids) id) then raise exception 'Selecciona entre 1 y 50 órdenes diferentes'; end if;
  if coalesce(p_soporte_path,'') not like 'aliados/pagos/%' then raise exception 'Comprobante inválido'; end if;
  select metadata into v_object from storage.objects where bucket_id='soportes' and name=p_soporte_path;
  if not found then raise exception 'El comprobante no se ha cargado. No se registró ningún pago'; end if;
  if coalesce(v_object.metadata->>'mimetype','') not in ('application/pdf','image/jpeg','image/png')
    or coalesce((v_object.metadata->>'size')::bigint,0) not between 1 and 10485760 then raise exception 'El soporte debe ser una imagen o PDF de máximo 10 MB'; end if;
  perform 1 from public.payment_orders where id=any(p_ids) order by id for update;
  select count(*) into v_count from public.payment_orders where id=any(p_ids);
  if v_count<>cardinality(p_ids) then raise exception 'Una orden ya no está disponible. Actualiza Tesorería'; end if;
  select * into v_first from public.payment_orders where id=p_ids[1];
  for v in select * from public.payment_orders where id=any(p_ids) order by id loop
    if v.historico_inicial then raise exception 'No se modifican pagos históricos desde este formulario'; end if;
    if v.beneficiary_id is distinct from v_first.beneficiary_id or v.bank_snapshot is distinct from v_first.bank_snapshot then
      raise exception 'El soporte agrupado requiere el mismo beneficiario y la misma cuenta de destino';
    end if;
    if v.estado not in ('programado','pagado','conciliado') then raise exception 'La orden no está lista para registrar el pago'; end if;
    if v.estado in ('pagado','conciliado') then
      if nullif(v.soporte_path,'') is not null and v.soporte_path<>p_soporte_path then raise exception 'La orden ya tiene un soporte; no se reemplazó'; end if;
      if v.estado='conciliado' and nullif(v.soporte_path,'') is null then raise exception 'La orden está conciliada; requiere revisión de su soporte'; end if;
    else
      if v.authorized_by is null or v.authorized_at is null then raise exception 'Falta autorización de Gerencia'; end if;
      if not exists(select 1 from public.liquidations l where l.id=v.liquidation_id and l.frozen_at is not null and l.approved_at is not null) then
        raise exception 'Falta aprobar el lote % · corte %',v.platform_snapshot,v.cutoff_snapshot;
      end if;
      if v.valor<=0 or exists(select 1 from unnest(array['bank','account_type','account_number','holder','holder_identification']) k where nullif(v.bank_snapshot->>k,'') is null) then
        raise exception 'La orden no tiene valor o cuenta completos';
      end if;
    end if;
  end loop;
  for v in select * from public.payment_orders where id=any(p_ids) order by id loop
    if v.estado='programado' then
      perform public.aliados_cambiar_estado_pago(v.id,'pagado',p_soporte_path);
    elsif nullif(v.soporte_path,'') is null then
      update public.payment_orders set soporte_path=p_soporte_path,updated_at=now() where id=v.id;
      insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'pago_soporte_adjuntado_sin_nuevo_debito','payment_orders',v.id,
        jsonb_build_object('soporte_path',p_soporte_path,'estado',v.estado));
    end if;
  end loop;
  return v_count;
end $function$

CREATE OR REPLACE FUNCTION public.aliados_exigir_liquidacion_aprobada_para_pago()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_liquidation public.liquidations%rowtype;
begin
  if coalesce(new.historico_inicial, false) then return new; end if;
  if new.estado not in ('programado', 'pagado')
     or new.estado is not distinct from old.estado then
    return new;
  end if;

  select * into v_liquidation
  from public.liquidations
  where id = new.liquidation_id;

  if not found
     or v_liquidation.frozen_at is null
     or v_liquidation.approved_at is null then
    raise exception 'Primero Mayte debe revisar y Oscar aprobar la liquidación; después se autoriza el pago';
  end if;

  if not exists (
    select 1
    from public.liquidation_treasury_destinations d
    where d.liquidation_id = new.liquidation_id
  ) then
    raise exception 'La liquidación aprobada no generó sus saldos de Tesorería; no se puede autorizar el pago';
  end if;

  return new;
end;
$function$


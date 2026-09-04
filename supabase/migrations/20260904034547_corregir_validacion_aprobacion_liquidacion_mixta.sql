create or replace function public.aliados_cambiar_estado(p_id uuid, p_estado text, p_comentario text default null)
returns public.liquidations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.liquidations%rowtype;
  v_anterior text;
  v_event text;
  v_pago_bancario_esperado numeric;
  v_pago_bancario_detalle numeric;
begin
  select * into v from public.liquidations where id=p_id for update;
  if not found then raise exception 'Liquidación no encontrada'; end if;
  v_anterior=v.estado;

  if p_estado='validada' then
    if not public.tiene_capacidad_aliados('revisor') then raise exception 'Solo Maite/revisor puede validar'; end if;
    if v.estado not in('importada','con_novedades') then raise exception 'Transición inválida'; end if;
    if exists(select 1 from public.liquidation_incidents where liquidation_id=p_id and bloquea_aprobacion and estado='abierta') then raise exception 'Resuelva las novedades antes de validar'; end if;
    update public.liquidations set estado='validada',updated_at=now() where id=p_id returning * into v;
    v_event='liquidation.validated';
  elsif p_estado='revisada' then
    if not public.tiene_capacidad_aliados('revisor') then raise exception 'Solo Maite/revisor puede revisar'; end if;
    if v.estado<>'calculada' then raise exception 'Transición inválida'; end if;
    update public.liquidations set estado='revisada',reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_id returning * into v;
    insert into public.liquidation_approvals(liquidation_id,etapa,decision,comentario) values(p_id,'revision','aprobada',p_comentario) on conflict do nothing;
    v_event='liquidation.reviewed';
  elsif p_estado='con_novedades' then
    if not public.tiene_capacidad_aliados('aprobador') then raise exception 'Solo Óscar/aprobador puede devolver la liquidación'; end if;
    if v.estado not in('calculada','revisada') then raise exception 'Transición inválida'; end if;
    if nullif(btrim(p_comentario),'') is null then raise exception 'El motivo es obligatorio'; end if;
    update public.liquidations set estado='con_novedades',reviewed_at=null,reviewed_by=null,updated_at=now() where id=p_id returning * into v;
    insert into public.liquidation_approvals(liquidation_id,etapa,decision,comentario) values(p_id,'revision','correccion',p_comentario) on conflict do nothing;
    v_event='liquidation.has_incidents';
  elsif p_estado='aprobada' then
    if not public.tiene_capacidad_aliados('aprobador') then raise exception 'Solo Óscar/aprobador puede aprobar'; end if;
    if v.estado<>'revisada' then raise exception 'Transición inválida'; end if;
    if exists(select 1 from public.liquidation_incidents where liquidation_id=p_id and bloquea_aprobacion and estado='abierta') then raise exception 'Existen novedades que bloquean la aprobación'; end if;
    if exists(select 1 from public.liquidation_operations where liquidation_id=p_id and tipo_establecimiento='propia' and coalesce(pagamos,0)<=0) then raise exception 'operacion_tienda_sin_pagamos'; end if;
    if exists(select 1 from public.liquidation_operations where liquidation_id=p_id and tipo_establecimiento='propia' and diferencia_inicial<>0 and diferencia_revisada_at is null) then raise exception 'diferencia_inicial_sin_revisar'; end if;
    if exists(select 1 from public.payment_orders po left join public.beneficiary_bank_accounts ba on ba.id=po.bank_account_id where po.liquidation_id=p_id and (ba.id is null or not ba.validada)) then raise exception 'Beneficiario sin cuenta bancaria validada'; end if;

    -- Solo aliados y bonificaciones generan órdenes bancarias. El valor de las
    -- tiendas propias se aplica por compensación a su cartera y no debe exigirse
    -- nuevamente dentro del detalle de transferencias.
    v_pago_bancario_esperado := coalesce(v.total_pago_aliados,0) + coalesce(v.total_bonos,0);
    select coalesce(sum(valor),0) into v_pago_bancario_detalle
      from public.payment_orders
      where liquidation_id=p_id and estado not in('rechazado','anulado');
    if v_pago_bancario_esperado <> v_pago_bancario_detalle then
      raise exception 'Órdenes bancarias (%) diferentes al pago esperado de aliados y bonos (%)', v_pago_bancario_detalle, v_pago_bancario_esperado;
    end if;

    update public.liquidations set estado='aprobada',approved_by=auth.uid(),approved_at=now(),frozen_at=now(),updated_at=now() where id=p_id returning * into v;
    insert into public.liquidation_approvals(liquidation_id,etapa,decision,comentario) values(p_id,'aprobacion','aprobada',p_comentario) on conflict do nothing;
    v_event='liquidation.approved';
  else
    raise exception 'Transición no habilitada por este RPC';
  end if;

  insert into public.liquidation_domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
    values(v_event,'liquidation',p_id,jsonb_build_object('liquidation_id',p_id),p_id||':'||p_estado)
    on conflict(idempotency_key) do nothing;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid(),'aliados_liquidacion_'||p_estado,'liquidations',p_id,jsonb_build_object('anterior',v_anterior,'nuevo',p_estado,'comentario',p_comentario));
  return v;
end;
$$;

revoke all on function public.aliados_cambiar_estado(uuid,text,text) from public, anon;
grant execute on function public.aliados_cambiar_estado(uuid,text,text) to authenticated;

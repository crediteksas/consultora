begin;

-- Completa la información operativa que Tesorería necesita para clasificar,
-- filtrar e imprimir cada orden sin depender de una segunda liquidación.
create or replace function public.aliados_preparar_orden_pago()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  beneficiary public.liquidation_beneficiaries%rowtype;
  liquidation public.liquidations%rowtype;
  bank public.beneficiary_bank_accounts%rowtype;
begin
  select * into beneficiary from public.liquidation_beneficiaries where id=new.beneficiary_id;
  select * into liquidation from public.liquidations where id=new.liquidation_id;
  select * into bank from public.beneficiary_bank_accounts where id=new.bank_account_id;

  new.payment_kind:=case when beneficiary.tipo='ejecutivo' then 'ejecutivo' else 'aliado' end;
  new.cutoff_snapshot:=liquidation.fecha_corte;
  new.platform_snapshot:=liquidation.plataforma;
  if bank.id is not null then
    new.bank_snapshot:=jsonb_build_object(
      'bank',bank.banco,'account_type',bank.tipo_cuenta,'account_number',bank.numero_cuenta,
      'holder',beneficiary.nombre,'holder_identification',beneficiary.identificacion
    );
  end if;
  return new;
end;
$$;

revoke all on function public.aliados_preparar_orden_pago() from public,anon,authenticated;
drop trigger if exists payment_orders_prepare_treasury on public.payment_orders;
create trigger payment_orders_prepare_treasury
before insert or update of liquidation_id,beneficiary_id,bank_account_id on public.payment_orders
for each row execute function public.aliados_preparar_orden_pago();

create or replace function public.aliados_refrescar_items_orden_pago()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare order_id uuid;
begin
  for order_id in
    select distinct id from (values
      (case when tg_op<>'DELETE' then new.payment_order_id else null end),
      (case when tg_op<>'INSERT' then old.payment_order_id else null end)
    ) as affected(id) where id is not null
  loop
    update public.payment_orders po set
      operations_count=(select count(distinct pi.operation_id) from public.payment_items pi where pi.payment_order_id=po.id),
      commercial_value=coalesce((select sum(o.valor_comercial) from public.payment_items pi join public.liquidation_operations o on o.id=pi.operation_id where pi.payment_order_id=po.id),0),
      own_bonuses=coalesce((select sum(pi.valor) from public.payment_items pi where pi.payment_order_id=po.id and pi.bonus_id is not null),0),
      concept=case when po.payment_kind='ejecutivo'
        then 'Bonos y comisiones — '||coalesce(po.platform_snapshot,'plataforma')||' — corte '||coalesce(po.cutoff_snapshot::text,'sin fecha')
        else 'Pago de '||(select count(distinct pi.operation_id) from public.payment_items pi where pi.payment_order_id=po.id)||' créditos '||case when po.platform_snapshot='alo' then 'ALO Credit' else 'PayJoy' end||' — corte '||coalesce(po.cutoff_snapshot::text,'sin fecha') end,
      updated_at=now()
    where po.id=order_id;
  end loop;
  return null;
end;
$$;

revoke all on function public.aliados_refrescar_items_orden_pago() from public,anon,authenticated;
drop trigger if exists payment_items_refresh_treasury_order on public.payment_items;
create trigger payment_items_refresh_treasury_order
after insert or update or delete on public.payment_items
for each row execute function public.aliados_refrescar_items_orden_pago();

-- Repara también las órdenes históricas creadas antes de esta mejora.
update public.payment_orders po set
  payment_kind=case when b.tipo='ejecutivo' then 'ejecutivo' else 'aliado' end,
  cutoff_snapshot=l.fecha_corte,
  platform_snapshot=l.plataforma,
  operations_count=(select count(distinct pi.operation_id) from public.payment_items pi where pi.payment_order_id=po.id),
  commercial_value=coalesce((select sum(o.valor_comercial) from public.payment_items pi join public.liquidation_operations o on o.id=pi.operation_id where pi.payment_order_id=po.id),0),
  own_bonuses=coalesce((select sum(pi.valor) from public.payment_items pi where pi.payment_order_id=po.id and pi.bonus_id is not null),0),
  concept=case when b.tipo='ejecutivo'
    then 'Bonos y comisiones — '||l.plataforma||' — corte '||coalesce(l.fecha_corte::text,'sin fecha')
    else 'Pago de '||(select count(distinct pi.operation_id) from public.payment_items pi where pi.payment_order_id=po.id)||' créditos '||case when l.plataforma='alo' then 'ALO Credit' else 'PayJoy' end||' — corte '||coalesce(l.fecha_corte::text,'sin fecha') end,
  bank_snapshot=coalesce((select jsonb_build_object(
    'bank',bank.banco,'account_type',bank.tipo_cuenta,'account_number',bank.numero_cuenta,
    'holder',b.nombre,'holder_identification',b.identificacion)
    from public.beneficiary_bank_accounts bank where bank.id=po.bank_account_id),po.bank_snapshot),
  updated_at=now()
from public.liquidation_beneficiaries b
join public.liquidations l on true
where b.id=po.beneficiary_id and l.id=po.liquidation_id;

create or replace function public.aliados_cambiar_estado_pago(p_id uuid,p_estado text,p_soporte_path text default null)
returns public.payment_orders
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v public.payment_orders%rowtype;previous text;event_name text;balance_data jsonb;movement_id uuid;
begin
  if not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para gestionar pagos';end if;
  select * into v from public.payment_orders where id=p_id for update;
  if not found then raise exception 'Pago no encontrado';end if;
  previous:=v.estado;
  if (v.estado,p_estado) not in (('pendiente','programado'),('programado','pagado'),('pagado','conciliado')) then raise exception 'Transición de pago inválida';end if;

  if p_estado='programado' and not public.tiene_capacidad_aliados('aprobador') then raise exception 'Solo Óscar/aprobador puede autorizar y programar el pago';end if;
  if p_estado='pagado' and (nullif(btrim(coalesce(p_soporte_path,v.soporte_path,'')),'') is null or v.bank_snapshot is null or v.valor<=0) then raise exception 'No se puede marcar Pagado sin soporte, valor, beneficiario y cuenta';end if;
  if p_estado='conciliado' and not public.tiene_capacidad_aliados('aprobador') then raise exception 'Solo Óscar/aprobador puede conciliar el pago';end if;

  if p_estado='pagado' and v.payment_kind='ejecutivo' then
    balance_data:=public.tesoreria_aplicar_saldo('tercerizacion','debit',v.valor,'executive-payment:'||v.id);
    insert into public.treasury_movements(unit,direction,type,beneficiary,concept,amount,destination_account,movement_date,support_path,liquidation_id,payment_order_id,balance_before,balance_after,status,requested_by,authorized_by,paid_by,idempotency_key)
    select 'tercerizacion','debit','pago_ejecutivo',b.nombre,v.concept,v.valor,'Cuenta terminada en '||right(v.bank_snapshot->>'account_number',4),(now() at time zone 'America/Bogota')::date,coalesce(p_soporte_path,v.soporte_path),v.liquidation_id,v.id,(balance_data->>'before')::numeric,(balance_data->>'after')::numeric,'pagado',auth.uid(),auth.uid(),auth.uid(),'executive-payment:'||v.id
    from public.liquidation_beneficiaries b where b.id=v.beneficiary_id on conflict(idempotency_key) do nothing returning id into movement_id;
  end if;

  update public.payment_orders set
    estado=p_estado,
    fecha_programada=case when p_estado='programado' then (now() at time zone 'America/Bogota')::date else fecha_programada end,
    fecha_pagada=case when p_estado='pagado' then now() else fecha_pagada end,
    soporte_path=coalesce(nullif(btrim(coalesce(p_soporte_path,'')),''),soporte_path),
    paid_by=case when p_estado='pagado' then auth.uid() else paid_by end,
    updated_at=now()
  where id=p_id returning * into v;

  event_name:=case when p_estado='programado' then 'payment.scheduled' when p_estado='pagado' and v.payment_kind='ejecutivo' then 'treasury.executive_payment_completed' when p_estado='pagado' then 'treasury.ally_payment_completed' when p_estado='conciliado' then 'payment.completed' end;
  if event_name is not null then
    insert into public.liquidation_domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
    values(event_name,'payment',v.id,case when v.payment_kind='ejecutivo' then jsonb_build_object('payment_id',v.id,'liquidation_id',v.liquidation_id,'period',v.cutoff_snapshot,'bonuses',v.own_bonuses,'amount_paid',v.valor,'support',v.soporte_path) else jsonb_build_object('payment_id',v.id,'liquidation_id',v.liquidation_id,'platform',v.platform_snapshot,'cutoff',v.cutoff_snapshot,'operations',v.operations_count,'amount_paid',v.valor,'support',v.soporte_path) end,v.id||':'||p_estado)
    on conflict(idempotency_key) do nothing;
  end if;
  if not exists(select 1 from public.payment_orders where liquidation_id=v.liquidation_id and estado<>p_estado) then
    update public.liquidations set estado=case p_estado when 'programado' then 'programada' when 'pagado' then 'pagada' when 'conciliado' then 'conciliada' end,updated_at=now() where id=v.liquidation_id;
  end if;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'aliados_pago_'||p_estado,'payment_orders',v.id,jsonb_build_object('anterior',previous,'nuevo',p_estado,'soporte_path',v.soporte_path));
  return v;
end;
$$;

revoke all on function public.aliados_cambiar_estado_pago(uuid,text,text) from public,anon;
grant execute on function public.aliados_cambiar_estado_pago(uuid,text,text) to authenticated;

commit;

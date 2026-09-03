alter table public.payment_orders
  add column if not exists authorized_by uuid references public.perfiles(id),
  add column if not exists authorized_at timestamptz;

comment on column public.payment_orders.authorized_by is
  'Usuario de Gerencia que autorizó expresamente el pago antes de su ejecución.';
comment on column public.payment_orders.authorized_at is
  'Fecha y hora de autorización expresa del pago.';

create unique index if not exists aliados_un_solo_aprobador_activo_idx
  on public.aliados_operadores (capacidad)
  where capacidad = 'aprobador' and activo;

create or replace function public.es_autorizador_pagos()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.aliados_operadores o
    join public.perfiles p on p.id = o.perfil_id
    where o.perfil_id = auth.uid()
      and o.capacidad = 'aprobador'
      and o.activo
      and p.activo
      and p.rol = 'gerencia'
  );
$$;

revoke all on function public.es_autorizador_pagos() from public, anon;
grant execute on function public.es_autorizador_pagos() to authenticated;

-- Conserva como autorizados únicamente los pagos cuya programación quedó
-- registrada por el aprobador activo. Las programaciones hechas por revisores
-- permanecen sin autorización y no podrán ejecutarse hasta que Gerencia las apruebe.
with ultima_autorizacion as (
  select distinct on (a.registro_id)
    a.registro_id::uuid as payment_id,
    p.id as approver_id,
    a.created_at as approved_at
  from public.audit_log a
  join public.perfiles p on p.id::text = a.usuario
  join public.aliados_operadores o
    on o.perfil_id = p.id
   and o.capacidad = 'aprobador'
   and o.activo
  where a.tabla = 'payment_orders'
    and a.accion = 'aliados_pago_programado'
    and p.activo
    and p.rol = 'gerencia'
    and a.registro_id ~* '^[0-9a-f-]{36}$'
  order by a.registro_id, a.created_at desc
)
update public.payment_orders po
set authorized_by = ua.approver_id,
    authorized_at = ua.approved_at
from ultima_autorizacion ua
where po.id = ua.payment_id
  and po.estado in ('programado', 'pagado', 'conciliado')
  and po.authorized_by is null;

create or replace function public.aliados_autorizar_pago(p_id uuid)
returns public.payment_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.payment_orders%rowtype;
  v_anterior text;
begin
  if not public.es_autorizador_pagos() then
    raise exception 'Solo Oscar Pacheco, desde su usuario de Gerencia, puede autorizar pagos';
  end if;

  select * into v
  from public.payment_orders
  where id = p_id
  for update;

  if not found then raise exception 'Pago no encontrado'; end if;
  if v.estado not in ('pendiente', 'programado') then
    raise exception 'El pago ya no está disponible para autorización';
  end if;
  if v.valor <= 0 or v.bank_snapshot is null then
    raise exception 'El pago no tiene valor o cuenta bancaria completa';
  end if;

  v_anterior := v.estado;
  update public.payment_orders
  set estado = 'programado',
      fecha_programada = (now() at time zone 'America/Bogota')::date,
      authorized_by = auth.uid(),
      authorized_at = now(),
      updated_at = now()
  where id = p_id
  returning * into v;

  insert into public.liquidation_domain_events(
    event_type, aggregate_type, aggregate_id, payload, idempotency_key
  ) values (
    'payment.authorized', 'payment', v.id,
    jsonb_build_object(
      'payment_id', v.id,
      'liquidation_id', v.liquidation_id,
      'authorized_by', v.authorized_by,
      'authorized_at', v.authorized_at,
      'amount', v.valor
    ),
    v.id || ':authorized:' || extract(epoch from v.authorized_at)::bigint
  );

  insert into public.audit_log(usuario, accion, tabla, registro_id, detalle)
  values (
    auth.uid()::text,
    'aliados_pago_autorizado_gerencia',
    'payment_orders',
    v.id::text,
    jsonb_build_object(
      'anterior', v_anterior,
      'nuevo', v.estado,
      'authorized_by', v.authorized_by,
      'authorized_at', v.authorized_at
    )
  );

  return v;
end;
$$;

revoke all on function public.aliados_autorizar_pago(uuid) from public, anon;
grant execute on function public.aliados_autorizar_pago(uuid) to authenticated;

create or replace function public.aliados_cambiar_estado_pago(p_id uuid,p_estado text,p_soporte_path text default null)
returns public.payment_orders
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v public.payment_orders%rowtype;
  previous text;
  event_name text;
  balance_data jsonb;
  movement_id uuid;
begin
  if not public.tiene_capacidad_aliados('revisor') then
    raise exception 'No autorizado para gestionar pagos';
  end if;

  select * into v from public.payment_orders where id=p_id for update;
  if not found then raise exception 'Pago no encontrado'; end if;
  previous:=v.estado;

  if (v.estado,p_estado) not in (
    ('pendiente','programado'),
    ('programado','pagado'),
    ('pagado','conciliado')
  ) then
    raise exception 'Transición de pago inválida';
  end if;

  if p_estado='programado' and not public.es_autorizador_pagos() then
    raise exception 'Solo Oscar Pacheco, desde su usuario de Gerencia, puede autorizar pagos';
  end if;

  if p_estado='pagado' then
    if v.authorized_by is null or v.authorized_at is null then
      raise exception 'El pago requiere autorización previa de Oscar Pacheco';
    end if;
    if not exists (
      select 1
      from public.aliados_operadores o
      join public.perfiles p on p.id=o.perfil_id
      where o.perfil_id=v.authorized_by
        and o.capacidad='aprobador'
        and o.activo
        and p.activo
        and p.rol='gerencia'
    ) then
      raise exception 'La autorización de Gerencia no es válida o ya no está activa';
    end if;
    if nullif(btrim(coalesce(p_soporte_path,v.soporte_path,'')),'') is null
       or v.bank_snapshot is null
       or v.valor<=0 then
      raise exception 'No se puede registrar el pago sin soporte, valor y cuenta bancaria';
    end if;
  end if;

  if p_estado='conciliado' and not public.es_autorizador_pagos() then
    raise exception 'Solo Oscar Pacheco puede conciliar el pago';
  end if;

  if p_estado='pagado' and v.payment_kind='ejecutivo' then
    balance_data:=public.tesoreria_aplicar_saldo('tercerizacion','debit',v.valor,'executive-payment:'||v.id);
    insert into public.treasury_movements(
      unit,direction,type,beneficiary,concept,amount,destination_account,
      movement_date,support_path,liquidation_id,payment_order_id,
      balance_before,balance_after,status,requested_by,authorized_by,paid_by,idempotency_key
    )
    select 'tercerizacion','debit','pago_ejecutivo',b.nombre,v.concept,v.valor,
      'Cuenta terminada en '||right(v.bank_snapshot->>'account_number',4),
      (now() at time zone 'America/Bogota')::date,
      coalesce(p_soporte_path,v.soporte_path),v.liquidation_id,v.id,
      (balance_data->>'before')::numeric,(balance_data->>'after')::numeric,
      'pagado',auth.uid(),v.authorized_by,auth.uid(),'executive-payment:'||v.id
    from public.liquidation_beneficiaries b
    where b.id=v.beneficiary_id
    on conflict(idempotency_key) do nothing
    returning id into movement_id;
  end if;

  update public.payment_orders set
    estado=p_estado,
    fecha_programada=case when p_estado='programado' then (now() at time zone 'America/Bogota')::date else fecha_programada end,
    fecha_pagada=case when p_estado='pagado' then now() else fecha_pagada end,
    soporte_path=coalesce(nullif(btrim(coalesce(p_soporte_path,'')),''),soporte_path),
    authorized_by=case when p_estado='programado' then auth.uid() else authorized_by end,
    authorized_at=case when p_estado='programado' then now() else authorized_at end,
    paid_by=case when p_estado='pagado' then auth.uid() else paid_by end,
    updated_at=now()
  where id=p_id returning * into v;

  event_name:=case
    when p_estado='programado' then 'payment.authorized'
    when p_estado='pagado' and v.payment_kind='ejecutivo' then 'treasury.executive_payment_completed'
    when p_estado='pagado' then 'treasury.ally_payment_completed'
    when p_estado='conciliado' then 'payment.completed'
  end;

  if event_name is not null then
    insert into public.liquidation_domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
    values(
      event_name,'payment',v.id,
      case when v.payment_kind='ejecutivo'
        then jsonb_build_object('payment_id',v.id,'liquidation_id',v.liquidation_id,'period',v.cutoff_snapshot,'bonuses',v.own_bonuses,'amount_paid',v.valor,'support',v.soporte_path,'authorized_by',v.authorized_by)
        else jsonb_build_object('payment_id',v.id,'liquidation_id',v.liquidation_id,'platform',v.platform_snapshot,'cutoff',v.cutoff_snapshot,'operations',v.operations_count,'amount_paid',v.valor,'support',v.soporte_path,'authorized_by',v.authorized_by)
      end,
      v.id||':'||p_estado
    ) on conflict(idempotency_key) do nothing;
  end if;

  if not exists(select 1 from public.payment_orders where liquidation_id=v.liquidation_id and estado<>p_estado) then
    update public.liquidations
    set estado=case p_estado when 'programado' then 'programada' when 'pagado' then 'pagada' when 'conciliado' then 'conciliada' end,
        updated_at=now()
    where id=v.liquidation_id;
  end if;

  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(
    auth.uid()::text,'aliados_pago_'||p_estado,'payment_orders',v.id::text,
    jsonb_build_object('anterior',previous,'nuevo',p_estado,'soporte_path',v.soporte_path,'authorized_by',v.authorized_by,'authorized_at',v.authorized_at)
  );
  return v;
end;
$$;

revoke all on function public.aliados_cambiar_estado_pago(uuid,text,text) from public,anon;
grant execute on function public.aliados_cambiar_estado_pago(uuid,text,text) to authenticated;

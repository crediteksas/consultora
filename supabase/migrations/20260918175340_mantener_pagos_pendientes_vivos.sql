-- Recupera una obligación principal que quedó calculada, pero sin orden de pago,
-- porque el beneficiario todavía no tenía cuenta. El lote y sus cálculos quedan
-- intactos: la nueva orden se crea pendiente para autorización individual.
do $repair$
declare
  v_operation public.liquidation_operations%rowtype;
  v_liquidation public.liquidations%rowtype;
  v_calculation public.liquidation_calculations%rowtype;
  v_beneficiary public.liquidation_beneficiaries%rowtype;
  v_account public.beneficiary_bank_accounts%rowtype;
  v_order public.payment_orders%rowtype;
begin
  select operation.*
    into strict v_operation
  from public.liquidation_operations operation
  join public.liquidations liquidation on liquidation.id = operation.liquidation_id
  where operation.imei = '351468680022856'
    and operation.origen_codigo = 'ALIADO-7FFC7812-E39F-4444-BD0E-5F180FF4D683'
    and liquidation.plataforma = 'krediya'
    and liquidation.fecha_corte = date '2026-09-13';

  select *
    into strict v_liquidation
  from public.liquidations
  where id = v_operation.liquidation_id
  for update;

  select *
    into strict v_calculation
  from public.liquidation_calculations
  where operation_id = v_operation.id;

  if v_calculation.pago_aliado <> 472000
     or v_operation.pago_neto_beneficiario <> 472000 then
    raise exception 'La obligación de A ALFER cambió: se esperaba un pago exacto de 472000';
  end if;

  if v_liquidation.approved_at is null
     or v_liquidation.frozen_at is null
     or v_liquidation.approved_by is null then
    raise exception 'La liquidación de A ALFER no conserva aprobación y cálculo congelado';
  end if;

  select *
    into strict v_beneficiary
  from public.liquidation_beneficiaries
  where origen_codigo = v_operation.origen_codigo
    and tipo = 'aliado'
    and activo;

  if nullif(btrim(v_beneficiary.identificacion), '') is null then
    raise exception 'El beneficiario de A ALFER sigue sin identificación';
  end if;

  select *
    into strict v_account
  from public.beneficiary_bank_accounts
  where beneficiary_id = v_beneficiary.id
    and activo
    and validada
  order by validada_at desc nulls last, created_at desc
  limit 1;

  select payment_order.*
    into v_order
  from public.payment_orders payment_order
  join public.payment_items item on item.payment_order_id = payment_order.id
  where item.operation_id = v_operation.id
    and item.bonus_id is null
    and item.concepto = 'pago_aliado';

  if v_order.id is null then
    insert into public.payment_orders (
      liquidation_id,
      beneficiary_id,
      bank_account_id,
      valor,
      estado,
      idempotency_key,
      created_by,
      payment_kind,
      concept,
      cutoff_snapshot,
      platform_snapshot,
      operations_count,
      commercial_value,
      own_bonuses,
      bank_snapshot,
      historico_inicial,
      requiere_soporte,
      recovery_review_required
    ) values (
      v_liquidation.id,
      v_beneficiary.id,
      v_account.id,
      472000,
      'pendiente',
      gen_random_uuid(),
      v_liquidation.approved_by,
      'aliado',
      'Pago de 1 crédito Krediya — corte ' || v_liquidation.fecha_corte::text,
      v_liquidation.fecha_corte,
      v_liquidation.plataforma,
      1,
      coalesce(v_operation.valor_comercial, v_operation.monto_credito, 0),
      0,
      jsonb_build_object(
        'bank', v_account.banco,
        'account_type', v_account.tipo_cuenta,
        'account_number', v_account.numero_cuenta,
        'holder', v_beneficiary.nombre,
        'holder_identification', v_beneficiary.identificacion
      ),
      false,
      true,
      false
    )
    returning * into v_order;

    insert into public.payment_items (
      payment_order_id,
      operation_id,
      bonus_id,
      concepto,
      valor
    ) values (
      v_order.id,
      v_operation.id,
      null,
      'pago_aliado',
      472000
    );
  end if;

  if v_order.valor <> 472000 or v_order.estado <> 'pendiente' then
    raise exception 'La orden recuperada no está pendiente por el valor exacto de 472000';
  end if;

  if v_order.authorized_by is not null
     or v_order.authorized_at is not null
     or v_order.paid_by is not null
     or v_order.fecha_pagada is not null
     or v_order.soporte_path is not null then
    raise exception 'La orden recuperada no puede quedar autorizada ni pagada automáticamente';
  end if;

  update public.liquidation_incidents incident
  set estado = 'resuelta',
      resolution = 'Cuenta validada y orden pendiente creada en Tesorería; requiere autorización de Gerencia.',
      resolved_by = v_liquidation.approved_by,
      resolved_at = now()
  where incident.operation_id = v_operation.id
    and incident.tipo = 'beneficiario_sin_identificacion'
    and incident.estado <> 'resuelta';

  if not exists (
    select 1
    from public.audit_log audit
    where audit.accion = 'obligacion_pago_recuperada'
      and audit.registro_id = v_order.id::text
  ) then
    insert into public.audit_log (
      usuario,
      accion,
      tabla,
      registro_id,
      detalle
    ) values (
      v_liquidation.approved_by::text,
      'obligacion_pago_recuperada',
      'payment_orders',
      v_order.id::text,
      jsonb_build_object(
        'operation_id', v_operation.id,
        'liquidation_id', v_liquidation.id,
        'origen_codigo', v_operation.origen_codigo,
        'imei', v_operation.imei,
        'valor', v_order.valor,
        'estado', v_order.estado,
        'autorizada', false,
        'pagada', false,
        'calculo_reabierto', false,
        'lote_recalculado', false,
        'motivo', 'Cuenta bancaria registrada después del cierre del lote'
      )
    );
  end if;
end;
$repair$;

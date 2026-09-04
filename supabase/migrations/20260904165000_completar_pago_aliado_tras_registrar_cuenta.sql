begin;

-- Una cuenta bancaria puede registrarse después de calcular la liquidación.
-- Completa tanto órdenes incompletas como órdenes que no pudieron nacer.
create unique index if not exists payment_items_operacion_concepto_sin_bono_uidx
  on public.payment_items(operation_id, concepto)
  where bonus_id is null;

create or replace function public.aliados_completar_pagos_beneficiario(p_beneficiary_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  bank public.beneficiary_bank_accounts%rowtype;
  beneficiary public.liquidation_beneficiaries%rowtype;
  operation record;
  payment_id uuid;
  v_completados integer := 0;
begin
  if not public.tiene_capacidad_aliados('revisor') then
    raise exception 'No autorizado';
  end if;

  select * into beneficiary
  from public.liquidation_beneficiaries
  where id=p_beneficiary_id;
  if not found then raise exception 'Beneficiario no encontrado'; end if;

  select * into bank
  from public.beneficiary_bank_accounts
  where beneficiary_id=p_beneficiary_id and activo and validada
  order by validada_at desc nulls last,created_at desc
  limit 1;
  if not found then
    raise exception 'Este beneficiario todavía no tiene una cuenta bancaria validada';
  end if;

  update public.payment_orders
  set bank_account_id=bank.id,
      payment_kind=case when beneficiary.tipo='ejecutivo' then 'ejecutivo' else 'aliado' end,
      bank_snapshot=jsonb_build_object(
        'bank',bank.banco,'account_type',bank.tipo_cuenta,'account_number',bank.numero_cuenta,
        'holder',beneficiary.nombre,'holder_identification',beneficiary.identificacion
      ),
      updated_at=now()
  where beneficiary_id=p_beneficiary_id
    and (bank_snapshot is null or bank_account_id<>bank.id);
  get diagnostics v_completados=row_count;

  if beneficiary.tipo='aliado' and nullif(btrim(beneficiary.origen_codigo),'') is not null then
    for operation in
      select l.id liquidation_id,l.fecha_corte,l.plataforma,
             op.id operation_id,op.valor_comercial,op.pago_neto_beneficiario
      from public.liquidations l
      join public.liquidation_operations op on op.liquidation_id=l.id
      where l.frozen_at is null
        and l.estado in ('calculada','revisada','con_novedades')
        and op.tipo_establecimiento='aliado'
        and op.reconocida
        and lower(op.origen_codigo)=lower(beneficiary.origen_codigo)
        and coalesce(op.pago_neto_beneficiario,0)>0
        and not exists (
          select 1 from public.payment_items pi
          where pi.operation_id=op.id and pi.concepto='pago_aliado' and pi.bonus_id is null
        )
      order by l.fecha_corte,op.created_at
      for update of op
    loop
      insert into public.payment_orders(
        liquidation_id,beneficiary_id,bank_account_id,valor,idempotency_key,created_by,
        payment_kind,cutoff_snapshot,platform_snapshot,bank_snapshot
      ) values (
        operation.liquidation_id,beneficiary.id,bank.id,operation.pago_neto_beneficiario,
        gen_random_uuid(),auth.uid(),'aliado',operation.fecha_corte,operation.plataforma,
        jsonb_build_object(
          'bank',bank.banco,'account_type',bank.tipo_cuenta,'account_number',bank.numero_cuenta,
          'holder',beneficiary.nombre,'holder_identification',beneficiary.identificacion
        )
      )
      on conflict(liquidation_id,beneficiary_id) do update
        set bank_account_id=excluded.bank_account_id,
            bank_snapshot=excluded.bank_snapshot,
            updated_at=now()
      returning id into payment_id;

      insert into public.payment_items(payment_order_id,operation_id,concepto,valor)
      values(payment_id,operation.operation_id,'pago_aliado',operation.pago_neto_beneficiario)
      on conflict do nothing;

      if found then
        v_completados:=v_completados+1;
      end if;

      update public.payment_orders po
      set valor=(select sum(pi.valor) from public.payment_items pi where pi.payment_order_id=po.id),
          updated_at=now()
      where po.id=payment_id;

      update public.liquidation_incidents
      set estado='resuelta',resolution='Cuenta bancaria cargada y orden de pago creada',resolved_at=now()
      where operation_id=operation.operation_id
        and tipo in ('beneficiario_sin_identificacion','beneficiario_sin_cuenta_pendiente','cuenta_bancaria_no_validada')
        and estado='abierta';
    end loop;
  end if;

  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(auth.uid(),'aliados_pagos_completados_tras_cuenta','liquidation_beneficiaries',p_beneficiary_id,
         jsonb_build_object('pagos_completados',v_completados));

  return v_completados;
end;
$$;

revoke all on function public.aliados_completar_pagos_beneficiario(uuid) from public,anon;
grant execute on function public.aliados_completar_pagos_beneficiario(uuid) to authenticated;

commit;

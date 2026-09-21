begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Interno: solo resuelve avisos bancarios con una orden existente y válida.
-- No crea órdenes, no cambia cuentas, importes, cálculos ni autorizaciones.
create or replace function kora_private.resolver_novedades_cuenta_existente(p_beneficiary_id uuid)
returns integer language plpgsql security invoker set search_path='' as $fn$
declare v_count integer;
begin
 with resolved as (
  update public.liquidation_incidents i
  set estado='resuelta',resolution='Titular y cuenta verificados en la orden existente. Sin recalcular ni autorizar pagos.',
      resolved_at=now(),resolved_by=auth.uid()
  from public.liquidation_operations op
  where op.id=i.operation_id and op.tipo_establecimiento='aliado' and op.reconocida
   and i.estado='abierta' and i.tipo in('beneficiario_sin_identificacion','beneficiario_sin_cuenta_pendiente','cuenta_bancaria_no_validada')
   and exists (
    select 1 from public.payment_items pi
    join public.payment_orders po on po.id=pi.payment_order_id
    join public.liquidation_beneficiaries b on b.id=po.beneficiary_id
    join public.beneficiary_bank_accounts ba on ba.id=po.bank_account_id and ba.beneficiary_id=b.id
    where pi.operation_id=op.id and pi.bonus_id is null and pi.concepto='pago_aliado'
     and po.liquidation_id=op.liquidation_id and po.estado='pendiente'
     and b.activo and b.tipo='aliado' and nullif(btrim(b.identificacion),'') is not null
     and b.id=public.aliados_beneficiario_de_comercio(op.origen_codigo)
     and (p_beneficiary_id is null or b.id=p_beneficiary_id)
     and ba.activo and ba.validada
   ) returning i.id,i.operation_id
 ), audited as (
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  select auth.uid(),'novedad_cuenta_sincronizada','liquidation_incidents',id::text,
   jsonb_build_object('operation_id',operation_id,'motivo','Cuenta verificada en orden existente','recalculo',false,'autorizacion',false)
  from resolved returning 1
 ) select count(*) into v_count from audited;
 return v_count;
end;
$fn$;
revoke all on function kora_private.resolver_novedades_cuenta_existente(uuid) from public,anon,authenticated;

-- Mantener íntegros el flujo y los permisos vigentes; sincronizar aun cuando
-- la orden ya existía y por eso no entró al bucle de creación de pagos.
do $patch$
declare v_definition text;v_anchor text;
begin
 v_definition:=pg_get_functiondef('public.aliados_completar_pagos_beneficiario(uuid)'::regprocedure);
 v_anchor:='return v_completados;';
 if position(v_anchor in v_definition)=0 then raise exception 'Cambió el RPC de completar pagos'; end if;
 v_definition:=replace(v_definition,v_anchor,'perform kora_private.resolver_novedades_cuenta_existente(p_beneficiary_id); '||v_anchor);
 execute v_definition;
 -- La asociación del titular puede ocurrir después de guardar la cuenta.
 v_definition:=pg_get_functiondef('public.tesoreria_guardar_cliente_cuenta(text,uuid,text,text,text,text,text,boolean)'::regprocedure);
 v_anchor:='return jsonb_build_object(''ok'',true,''beneficiary_id'',v_holder.id,''bank_account_id'',v_account.id);';
 if position(v_anchor in v_definition)=0 then raise exception 'Cambió el RPC de guardar cuenta'; end if;
 execute replace(v_definition,v_anchor,'perform kora_private.resolver_novedades_cuenta_existente(v_holder.id); '||v_anchor);
end;
$patch$;
-- Reparar solo novedades abiertas que cumplen las mismas comprobaciones.
select kora_private.resolver_novedades_cuenta_existente(null);
commit;

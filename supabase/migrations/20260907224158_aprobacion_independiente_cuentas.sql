-- La aprobación congela el cálculo, no exige que las cuentas estén preparadas.
do $migration$
declare body text; start_at int; end_at int;
begin
 body:=pg_get_functiondef('kora_private.cambiar_estado_liquidacion(uuid,text,text)'::regprocedure);
 start_at:=strpos(body,'    if v.plataforma<>''krediya'' and exists(select 1 from public.payment_orders');
 end_at:=strpos(body,'    update public.liquidations set estado=''aprobada''');
 if start_at=0 or end_at<=start_at then raise exception 'Cambió el control de aprobación'; end if;
 body:=left(body,start_at-1)||'    -- Las cuentas pendientes se completan en Tesorería, sin recalcular el lote.'||chr(10)||substr(body,end_at);
 body:=replace(body,'    if v.estado<>''revisada'' then raise exception ''Transición inválida''; end if;',
 '    if v.approved_at is not null and v.frozen_at is not null then return v; end if;
    if v.estado<>''revisada'' then raise exception ''Transición inválida''; end if;');
 execute body;
 body:=pg_get_functiondef('kora_private.pendientes_tesoreria_liquidacion(uuid)'::regprocedure);
 body:=replace(body,'where l.frozen_at is null and l.estado in (''importada'',''validada'',''con_novedades'',''calculada'',''revisada'')',
 'where l.estado in (''importada'',''validada'',''con_novedades'',''calculada'',''revisada'',''aprobada'',''programada'')');
 execute body;
 -- Tesorería consume los importes ALO aprobados, no la fórmula antigua.
 body:=pg_get_functiondef('public.tesoreria_generar_destinos_liquidacion(uuid)'::regprocedure);
 if strpos(body,'else right_value:=round(op_base*o.porcentaje_politica,2); end if;')=0 then raise exception 'Cambió generación de destinos'; end if;
 body:=replace(body,'else right_value:=round(op_base*o.porcentaje_politica,2); end if;',
 'elsif l.plataforma=''alo'' then right_value:=o.pagamos; else right_value:=round(op_base*o.porcentaje_politica,2); end if;');
 body:=replace(body,'else commission_value:=round(op_base-right_value-op_bonus,2); end if;',
 'elsif l.plataforma=''alo'' then commission_value:=o.utilidad_creditek; else commission_value:=round(op_base-right_value-op_bonus,2); end if;');
 execute body;
end;$migration$;

create function kora_private.completar_ordenes_aprobadas(p_lote uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.liquidations%rowtype;r record;b uuid;a uuid;po public.payment_orders%rowtype;created_count int:=0;
begin
 if auth.uid() is null or not coalesce(public.tiene_capacidad_aliados('revisor'),false) then raise exception 'No autorizado'; end if;
 select * into l from public.liquidations where id=p_lote for update;
 if not found or l.approved_at is null or l.frozen_at is null or l.estado not in ('aprobada','programada') then raise exception 'El lote debe estar aprobado y pendiente de pago'; end if;
 for r in
  select o.id operation_id,null::uuid bonus_id,'pago_aliado'::text concepto,c.pago_aliado valor,
   public.aliados_beneficiario_de_comercio(o.origen_codigo) beneficiary_id
  from public.liquidation_operations o join public.liquidation_calculations c on c.operation_id=o.id
  where o.liquidation_id=p_lote and o.tipo_establecimiento='aliado' and c.pago_aliado>0
  union all
  select bn.operation_id,bn.id,'bono_'||bn.tipo_bono,bn.valor,bn.beneficiary_id
  from public.liquidation_bonuses bn where bn.liquidation_id=p_lote and bn.estado='aprobado' and bn.valor>0
 loop
  if exists(select 1 from public.payment_items pi join public.payment_orders p on p.id=pi.payment_order_id
   where p.liquidation_id=p_lote and p.estado not in ('anulado','rechazado')
    and pi.operation_id=r.operation_id and pi.bonus_id is not distinct from r.bonus_id) then continue; end if;
  select id into b from public.liquidation_beneficiaries where id=r.beneficiary_id and activo and nullif(btrim(identificacion),'') is not null;
  if not found then continue; end if;
  select id into a from public.beneficiary_bank_accounts where beneficiary_id=b and activo and validada order by validada_at desc limit 1;
  if not found then continue; end if;
  select * into po from public.payment_orders where liquidation_id=p_lote and beneficiary_id=b for update;
  if found then
   if po.estado not in ('pendiente','programado') or po.bank_account_id is distinct from a then
    continue; -- No modificar órdenes autorizadas ni destinos congelados.
   end if;
   update public.payment_orders set valor=valor+r.valor where id=po.id;
  else
   insert into public.payment_orders(liquidation_id,beneficiary_id,bank_account_id,valor,idempotency_key)
   values(p_lote,b,a,r.valor,gen_random_uuid()) returning * into po;
  end if;
  insert into public.payment_items(payment_order_id,operation_id,bonus_id,concepto,valor) values(po.id,r.operation_id,r.bonus_id,r.concepto,r.valor);
  created_count:=created_count+1;
 end loop;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'tesoreria_ordenes_completadas','liquidations',p_lote,jsonb_build_object('items_creados',created_count,'calculo_congelado',true));
 return jsonb_build_object('ok',true,'items_creados',created_count);
end;$$;
revoke all on function kora_private.completar_ordenes_aprobadas(uuid) from public,anon;
grant execute on function kora_private.completar_ordenes_aprobadas(uuid) to authenticated;
create function public.tesoreria_completar_ordenes_aprobadas(p_lote uuid) returns jsonb
language sql security invoker set search_path='' as $$select kora_private.completar_ordenes_aprobadas(p_lote);$$;
revoke all on function public.tesoreria_completar_ordenes_aprobadas(uuid) from public,anon;
grant execute on function public.tesoreria_completar_ordenes_aprobadas(uuid) to authenticated;

-- La aprobación autoriza el principal. Los bonos sin responsable se completan
-- exclusivamente por el RPC de Tesorería; no se descongela ningún lote.
create table kora_private.bonos_diferidos (
 operation_id uuid primary key, liquidation_id uuid not null,
 created_at timestamptz not null default now(), completed_at timestamptz,
 permit_transaction bigint, before_data jsonb, after_data jsonb,
 completed_by uuid
);
alter table kora_private.bonos_diferidos enable row level security;
revoke all on kora_private.bonos_diferidos from public,anon,authenticated;

create or replace function kora_private.proteger_bonos_pendientes() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.estado='aprobada' and old.estado is distinct from 'aprobada' then
  insert into kora_private.bonos_diferidos(operation_id,liquidation_id)
   select op.id,new.id from public.liquidation_operations op
   where op.liquidation_id=new.id and op.reconocida and op.tipo_establecimiento='aliado' and op.ejecutivo_id is null
   on conflict do nothing;
 end if;
 return new;
end;$$;

-- Excepción acotada a los campos de bonos, durante la transacción privada.
do $migration$
declare body text;
begin
 body:=pg_get_functiondef('public.aliados_impedir_cambio_operacion_aprobada()'::regprocedure);
 body:=replace(body,'begin', 'begin
 if TG_OP=''UPDATE'' and exists(select 1 from kora_private.bonos_diferidos d where d.operation_id=old.id and d.permit_transaction=txid_current() and d.completed_at is null)
  and (to_jsonb(old)-array[''ejecutivo_id'',''bonos_aplicados'',''utilidad_creditek''])=(to_jsonb(new)-array[''ejecutivo_id'',''bonos_aplicados'',''utilidad_creditek'']) then return new; end if;');
 -- Trigger needs access only to the private authorization record.
 body:=replace(body,'LANGUAGE plpgsql','LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''''');
 execute body;
 body:=pg_get_functiondef('public.aliados_impedir_cambio_aprobado()'::regprocedure);
 body:=replace(body,'begin','begin
 if exists(select 1 from kora_private.bonos_diferidos d where d.liquidation_id=old.id and d.permit_transaction=txid_current() and d.completed_at is null)
  and (to_jsonb(old)-array[''total_bonos'',''total_utilidad_creditek'',''total_pagar'',''updated_at''])=(to_jsonb(new)-array[''total_bonos'',''total_utilidad_creditek'',''total_pagar'',''updated_at'']) then return new; end if;');
 body:=replace(body,'LANGUAGE plpgsql','LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''''');
 execute body;
end;$migration$;

-- Los bonos sin cuenta permanecen visibles, aunque el aliado ya tenga orden.
do $migration$
declare body text;
begin
 body:=pg_get_functiondef('kora_private.pendientes_tesoreria_liquidacion(uuid)'::regprocedure);
 body:=replace(body,'(op.ejecutivo_id is distinct from o.ejecutivo_id or c.id is null or (c.pago_aliado>0 and not exists(',
 '(exists(select 1 from public.liquidation_bonuses bn where bn.operation_id=op.id and bn.estado=''aprobado'' and bn.valor>0 and not exists(select 1 from public.payment_items pi join public.payment_orders po on po.id=pi.payment_order_id where pi.bonus_id=bn.id and po.estado not in (''anulado'',''rechazado''))) or op.ejecutivo_id is distinct from o.ejecutivo_id or c.id is null or (c.pago_aliado>0 and not exists(');
 execute body;
end;$migration$;
revoke all on function public.aliados_impedir_cambio_operacion_aprobada() from public,anon,authenticated;
revoke all on function public.aliados_impedir_cambio_aprobado() from public,anon,authenticated;

-- Reutiliza exactamente las políticas actuales, pero SOLO para operaciones
-- diferidas, sin borrar bonos existentes ni repetir la comisión universal.
do $migration$
declare body text; start_at int; end_at int;
begin
 body:=pg_get_functiondef('public.aliados_calcular_bonos_ejecutivos(uuid)'::regprocedure);
 body:=replace(body,'public.aliados_calcular_bonos_ejecutivos','kora_private.calcular_bonos_diferidos');
 start_at:=strpos(body,'  if exists(select 1 from liquidations where id=p_liquidation_id');
 end_at:=strpos(body,'  for o in');
 if start_at=0 or end_at<=start_at then raise exception 'Cambió motor de bonos'; end if;
 body:=left(body,start_at-1)||substr(body,end_at);
 body:=replace(body,'and lo.origen_codigo is not null','and lo.origen_codigo is not null
      and exists(select 1 from kora_private.bonos_diferidos d where d.operation_id=lo.id and d.completed_at is null and d.permit_transaction=txid_current())');
 start_at:=strpos(body,'    -- comisión universal');
 end_at:=strpos(substr(body,start_at),'  end loop;')+start_at-1;
 -- End of universal loop, followed by the operation loop. Preserve latter.
 if start_at=0 or end_at<start_at then raise exception 'Cambió comisión universal'; end if;
 body:=left(body,start_at-1)||substr(body,end_at+length('  end loop;'));
 execute body;
end;$migration$;
revoke all on function kora_private.calcular_bonos_diferidos(uuid) from public,anon,authenticated;

-- No reconocer utilidad provisional como saldo disponible. Se reconocerá
-- únicamente al completar el bono de esa operación en Tesorería.
do $migration$
declare body text;
begin
 body:=pg_get_functiondef('public.tesoreria_generar_destinos_liquidacion(uuid)'::regprocedure);
 body:=replace(body,'  commission:=commission+commission_value;',
 '  if l.plataforma<>''krediya'' and exists(select 1 from kora_private.bonos_diferidos d where d.operation_id=o.id and d.completed_at is null) then commission_value:=0; end if;
  commission:=commission+commission_value;');
 execute body;
end;$migration$;

create function kora_private.completar_bonos_tesoreria(p_lote uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare l public.liquidations%rowtype;r record;delta numeric;total_delta numeric:=0;bonus numeric;utility numeric;balance_data jsonb;n int:=0;
begin
 if auth.uid() is null or not coalesce(public.tiene_capacidad_aliados('revisor'),false) then raise exception 'No autorizado'; end if;
 select * into l from public.liquidations where id=p_lote for update;
 if not found or l.approved_at is null or l.frozen_at is null or l.estado not in ('aprobada','programada') then raise exception 'Lote no disponible para preparar pagos'; end if;
 update kora_private.bonos_diferidos d set permit_transaction=txid_current(),before_data=to_jsonb(op)
 from public.liquidation_operations op join public.origenes o on o.codigo=op.origen_codigo
 where d.operation_id=op.id and d.liquidation_id=p_lote and d.completed_at is null
 and op.ejecutivo_id is null and exists(select 1 from public.ejecutivos e join public.liquidation_beneficiaries b on b.ejecutivo_id=e.id and b.activo and b.tipo='ejecutivo'
   where e.id=o.ejecutivo_id and e.activo and e.esquema_comision is not null);
 perform kora_private.calcular_bonos_diferidos(p_lote);
 for r in select d.*,op.utilidad_creditek,op.bonos_aplicados from kora_private.bonos_diferidos d join public.liquidation_operations op on op.id=d.operation_id
  where d.liquidation_id=p_lote and d.completed_at is null and d.permit_transaction=txid_current() loop
  select coalesce(sum(valor),0) into bonus from public.liquidation_bonuses where operation_id=r.operation_id and estado='aprobado';
  delta:=bonus-coalesce(r.bonos_aplicados,0);utility:=r.utilidad_creditek-delta;
  update public.liquidation_operations set bonos_aplicados=bonus,utilidad_creditek=utility where id=r.operation_id;
  update public.liquidation_calculations set total_bonos=bonus,utilidad_creditek=utility where operation_id=r.operation_id;
  if l.plataforma<>'krediya' and utility<>0 then
   balance_data:=public.tesoreria_aplicar_saldo('tercerizacion',case when utility>0 then 'credit' else 'debit' end,abs(utility),'commission-operation:'||r.operation_id);
   insert into public.treasury_movements(unit,direction,type,concept,amount,movement_date,liquidation_id,balance_before,balance_after,status,requested_by,idempotency_key)
   values('tercerizacion',case when utility>0 then 'credit' else 'debit' end,'comision_aliado','Utilidad definitiva tras asignar ejecutivo',abs(utility),l.fecha_corte,p_lote,(balance_data->>'before')::numeric,(balance_data->>'after')::numeric,'pagado',auth.uid(),'commission-operation:'||r.operation_id);
   update public.liquidation_treasury_destinations set total_outsourcing_commission=total_outsourcing_commission+utility where liquidation_id=p_lote;
  end if;
  total_delta:=total_delta+delta;n:=n+1;
 end loop;
 if n>0 then
  update public.liquidations set total_bonos=total_bonos+total_delta,total_pagar=total_pagar+total_delta,total_utilidad_creditek=total_utilidad_creditek-total_delta,updated_at=now() where id=p_lote;
  update kora_private.bonos_diferidos d set completed_at=now(),completed_by=auth.uid(),after_data=to_jsonb(op),permit_transaction=null
   from public.liquidation_operations op where d.operation_id=op.id and d.liquidation_id=p_lote and d.permit_transaction=txid_current();
  update public.liquidation_incidents i set estado='resuelta' where i.liquidation_id=p_lote and i.tipo='aliado_sin_ejecutivo' and exists(select 1 from kora_private.bonos_diferidos d where d.operation_id=i.operation_id and d.completed_at is not null);
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'bonos_completados_tesoreria','liquidations',p_lote,jsonb_build_object('bonos_antes',l.total_bonos,'bonos_despues',l.total_bonos+total_delta,'principal_sin_cambios',true,'operaciones',n));
 end if;
 return n;
end;$$;
revoke all on function kora_private.completar_bonos_tesoreria(uuid) from public,anon,authenticated;

create function kora_private.exigir_bono_preparado_para_pago() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.estado='pagado' and old.estado is distinct from 'pagado' and exists(
  select 1 from public.payment_items pi join kora_private.bonos_diferidos d on d.operation_id=pi.operation_id
  where pi.payment_order_id=new.id and d.completed_at is null
 ) then raise exception 'Asigna el ejecutivo en Preparación de pagos de Tesorería. La liquidación ya está aprobada; no debes aprobarla otra vez.'; end if;
 return new;
end;$$;
revoke all on function kora_private.exigir_bono_preparado_para_pago() from public,anon,authenticated;
create trigger exigir_bono_preparado_para_pago before update of estado on public.payment_orders
for each row execute function kora_private.exigir_bono_preparado_para_pago();

do $migration$
declare body text;
begin
 body:=pg_get_functiondef('kora_private.completar_ordenes_aprobadas(uuid)'::regprocedure);
 body:=replace(body,' for r in',' perform kora_private.completar_bonos_tesoreria(p_lote);
 for r in');
 execute body;
end;$migration$;

-- Code-only functions; dependency tables intentionally reduced. No production rows.

create role anon;create role authenticated;create role service_role;create schema kora_private;create schema liquidaciones_api_private;
create table perfiles(id uuid primary key,rol text);
create table liquidations(id uuid primary key,plataforma text,estado text,frozen_at timestamptz,total_operaciones numeric,total_pago_aliados numeric,total_pagar numeric,total_utilidad_creditek numeric,updated_at timestamptz);
create table liquidation_operations(id uuid primary key,liquidation_id uuid,plataforma text,tipo_establecimiento text,reconocida boolean,monto_credito numeric,monto_base numeric,accesorios numeric,inicial numeric,valor_comercial numeric,porcentaje_politica numeric,pagamos numeric,pago_neto_beneficiario numeric,bonos_aplicados numeric,utilidad_creditek numeric,origen_codigo text,external_id text);
create table liquidation_calculations(id uuid primary key,operation_id uuid,pagamos numeric,pago_aliado numeric,total_bonos numeric,utilidad_creditek numeric,explanation jsonb);
create table payment_orders(id uuid primary key default gen_random_uuid(),liquidation_id uuid,beneficiary_id uuid,bank_account_id uuid,valor numeric,estado text,fecha_pagada timestamptz,soporte_path text,secuencia_beneficiario int default 0,idempotency_key uuid,created_by uuid,origen_operacion text,concept text,commercial_value numeric,unique(liquidation_id,beneficiary_id,secuencia_beneficiario));
create table payment_items(id uuid default gen_random_uuid(),payment_order_id uuid,operation_id uuid,concepto text,valor numeric);
create table liquidation_adjustments(liquidation_id uuid,operation_id uuid,field_name text,old_value jsonb,new_value jsonb,motivo text,estado text,created_by uuid,approved_by uuid,approved_at timestamptz);
create table liquidation_treasury_destinations(liquidation_id uuid,total_allies numeric,total_outsourcing_commission numeric,received_from_platform numeric);
create table treasury_movements(unit text,direction text,type text,concept text,amount numeric,movement_date date,liquidation_id uuid,balance_before numeric,balance_after numeric,status text,requested_by uuid,idempotency_key text unique);
create function public.tesoreria_aplicar_saldo(text,text,numeric,text) returns jsonb language sql as $$select jsonb_build_object('before',0,'after',$3)$$;

create table audit_log(usuario uuid,accion text,tabla text,registro_id uuid,detalle jsonb);
create function public.aliados_impedir_cambio_aprobado() returns trigger language plpgsql as $$begin raise exception 'inmutable';end$$;
create function public.aliados_impedir_cambio_operacion_aprobada() returns trigger language plpgsql as $$begin raise exception 'inmutable';end$$;
create trigger guard before update on liquidations for each row execute function aliados_impedir_cambio_aprobado();
create trigger guard before update on liquidation_operations for each row execute function aliados_impedir_cambio_operacion_aprobada();


create table settlement_policy_versions(id uuid);create table liquidation_beneficiaries(id uuid);create table beneficiary_bank_accounts(id uuid);create table liquidation_bonuses(id uuid);create table retail_b2b_compensations(id uuid);

CREATE OR REPLACE FUNCTION liquidaciones_api_private.calcular_liquidacion_sin_datos_pago(p_id uuid)
 RETURNS liquidations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v public.liquidations%rowtype;o public.liquidation_operations%rowtype;p public.settlement_policy_versions%rowtype;
 b public.liquidation_beneficiaries%rowtype;a public.beneficiary_bank_accounts%rowtype;c public.liquidation_calculations%rowtype;
 bn public.liquidation_bonuses%rowtype;
 v_count int;v_policy_id uuid;v_comercial numeric;v_base numeric;v_pagamos numeric;v_pago numeric;v_bonus numeric;v_util numeric;v_order uuid;
 v_tot_comercial numeric:=0;v_tot_aliados numeric:=0;v_tot_tiendas numeric:=0;v_tot_bonus numeric:=0;v_tot_util numeric:=0;v_util_tiendas numeric:=0;
 v_count_tiendas integer:=0;v_count_aliados integer:=0;v_future boolean;
begin
 if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para calcular'; end if;
 select * into v from public.liquidations where id=p_id for update;
 if not found then raise exception 'Liquidación no encontrada'; end if;
 if v.plataforma='krediya' then return krediya_private.calcular_y_enviar_aprobacion(p_id); end if;
 if v.frozen_at is not null then raise exception 'Liquidación aprobada inmutable'; end if;
 if v.estado not in('importada','con_novedades','validada','calculada','revisada') then raise exception 'La liquidación no es editable'; end if;
 perform kora_private.preparar_catalogo_liquidacion(p_id);
 delete from public.payment_items where payment_order_id in(select id from public.payment_orders where liquidation_id=p_id and estado='pendiente');
 delete from public.payment_orders where liquidation_id=p_id and estado='pendiente';
 delete from public.liquidation_calculations where liquidation_id=p_id;
 perform public.aliados_calcular_bonos_ejecutivos(p_id);

 for o in select * from public.liquidation_operations where liquidation_id=p_id order by operation_at,id loop
  if o.operation_at is null then
    insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'fecha_operacion_ausente','La operación no tiene fecha para resolver su política') on conflict do nothing;continue;
  end if;
  v_future:=o.operation_at::date>=date '2026-08-05';
  if not o.reconocida or o.tipo_establecimiento='no_reconocido' then
    insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'operacion_no_reconocida','La operación o el establecimiento no están reconocidos') on conflict do nothing;continue;
  end if;
  -- La comisión pendiente no impide calcular el principal del aliado.
  -- Se presenta separadamente en Tesorería y no se declara utilidad definitiva.

  if v_future then
    select count(*),min(id::text)::uuid into v_count,v_policy_id from public.settlement_policy_versions
    where plataforma=o.plataforma and tipo_establecimiento=o.tipo_establecimiento and estado='aprobada'
      and vigente_desde<=o.operation_at::date and (vigente_hasta is null or vigente_hasta>=o.operation_at::date);
    if v_count<>1 then
      insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,case when v_count=0 then 'politica_ausente' else 'politica_ambigua' end,'No existe una política única vigente') on conflict do nothing;continue;
    end if;
    select * into p from public.settlement_policy_versions where id=v_policy_id;
    v_comercial:=coalesce(o.monto_credito,o.monto_base)+case when o.plataforma='payjoy' then 0 else o.inicial end;
    v_base:=case when o.plataforma='alo' then v_comercial else coalesce(o.monto_credito,o.monto_base) end;
    v_pagamos:=round(v_base*p.porcentaje,2);
    v_pago:=round(v_pagamos-o.inicial,2);
    select coalesce(sum(valor),0) into v_bonus from public.liquidation_bonuses where operation_id=o.id and estado='aprobado';
    v_util:=round(case when o.plataforma='payjoy' then coalesce(o.monto_credito,o.monto_base)-o.inicial-v_pago-v_bonus when o.plataforma='alo' then coalesce(o.monto_credito,o.monto_base)-v_pago-v_bonus else v_base-v_pagamos-v_bonus end,2);
    
    if v_pago<0 then raise exception 'valor_pago_negativo_imposible'; end if;
    if v_util<0 then
      insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion)
      values(p_id,o.id,'utilidad_negativa_seguimiento','La operación genera pérdida. Se conserva PAGAMOS; Gestión debe revisar la política.',false)
      on conflict(liquidation_id,operation_id,tipo) do update
       set descripcion=excluded.descripcion,bloquea_aprobacion=false;
    end if;
 
    update public.liquidation_operations set valor_comercial=v_comercial,porcentaje_politica=p.porcentaje,
      policy_version_id=p.id,policy_snapshot=to_jsonb(p),pagamos=v_pagamos,pago_neto_beneficiario=v_pago,
      pago_neto_tienda=case when tipo_establecimiento='propia' then v_pago else pago_neto_tienda end,
      bonos_aplicados=v_bonus,utilidad_creditek=v_util,
      utilidad_creditek_tienda=case when tipo_establecimiento='propia' then v_util else utilidad_creditek_tienda end,
      snapshot_tienda_at=case when tipo_establecimiento='propia' then now() else snapshot_tienda_at end where id=o.id;
    insert into public.liquidation_calculations(liquidation_id,operation_id,policy_version_id,policy_snapshot,pagamos,pago_aliado,total_bonos,utilidad_creditek,explanation)
    values(p_id,o.id,p.id,to_jsonb(p),v_pagamos,v_pago,v_bonus,v_util,jsonb_build_object('valor_credito',coalesce(o.monto_credito,o.monto_base),'inicial_plataforma',o.inicial,'valor_comercial',v_comercial,'base_calculo',v_base,'porcentaje',p.porcentaje,'formula',p.formula_code,'accesorios_cantidad',o.accesorios_cantidad,'accesorios_valor',o.accesorios)) returning * into c;
  elsif o.tipo_establecimiento='aliado' then
    select count(*),min(id::text)::uuid into v_count,v_policy_id from public.settlement_policy_versions where plataforma=o.plataforma and tipo_establecimiento='aliado' and estado='aprobada' and vigente_desde<=o.operation_at::date and (vigente_hasta is null or vigente_hasta>=o.operation_at::date);
    if v_count<>1 then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'politica_ausente','No existe una política histórica única vigente') on conflict do nothing;continue;end if;
    select * into p from public.settlement_policy_versions where id=v_policy_id;
    v_comercial:=case p.base_field when 'monto_credito' then o.monto_credito else o.monto_base end;
    v_pagamos:=round(v_comercial*p.porcentaje,2);v_pago:=round(v_pagamos-o.inicial,2);
    select coalesce(sum(valor),0) into v_bonus from public.liquidation_bonuses where operation_id=o.id and estado='aprobado';v_util:=round(v_comercial-v_pagamos-v_bonus,2);
    insert into public.liquidation_calculations(liquidation_id,operation_id,policy_version_id,policy_snapshot,pagamos,pago_aliado,total_bonos,utilidad_creditek,explanation)
    values(p_id,o.id,p.id,to_jsonb(p),v_pagamos,v_pago,v_bonus,v_util,jsonb_build_object('base_field',p.base_field,'base_liquidable',v_comercial,'formula',p.formula_code)) returning * into c;
  else
    if coalesce(o.pagamos,0)<=0 then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'operacion_tienda_sin_pagamos','La operación histórica requiere el Pagamos congelado') on conflict do nothing;continue;end if;
    v_comercial:=case when o.plataforma='payjoy' then coalesce(o.monto_credito,o.monto_base)-o.inicial_kora else o.monto_base end;
    v_pago:=o.pago_neto_tienda;v_bonus:=0;v_util:=o.utilidad_creditek_tienda;
  end if;

  if o.tipo_establecimiento='propia' and o.inicial_kora is null then
    insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion) values(p_id,o.id,'imei_no_resuelto','El equipo no está registrado en el inventario de KORA (IMEI no encontrado). No bloquea el pago; debe registrarse pronto en la tienda.',false) on conflict do nothing;
  elsif o.tipo_establecimiento='propia' and o.diferencia_inicial<>0 and o.diferencia_revisada_at is null then
    insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion) values(p_id,o.id,'diferencia_inicial_sin_revisar','La inicial registrada en KORA difiere de la reportada por la plataforma - requiere revisión antes de aprobar',true) on conflict do nothing;
  end if;
  if not (v_future and o.tipo_establecimiento='propia') and v_pago>0 then
   select * into b from public.liquidation_beneficiaries where activo and ((o.tipo_establecimiento='aliado' and id=public.aliados_beneficiario_de_comercio(o.origen_codigo)) or (o.tipo_establecimiento<>'aliado' and tipo='otro' and origen_codigo=o.origen_codigo)) limit 1;
   if not found then
     insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion) values(p_id,o.id,'beneficiario_sin_identificacion','No existe beneficiario de pago registrado con cuenta bancaria. No bloquea el cálculo; falta registrar la cuenta para poder girar el pago.',false) on conflict do nothing;
   else
     select * into a from public.beneficiary_bank_accounts where beneficiary_id=b.id and activo and validada order by validada_at desc limit 1;
     if not found then
       insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion) values(p_id,o.id,'cuenta_bancaria_no_validada','El beneficiario no tiene cuenta bancaria validada. No bloquea el cálculo; falta antes de poder girar el pago.',false) on conflict do nothing;
     else
       insert into public.payment_orders(liquidation_id,beneficiary_id,bank_account_id,valor,idempotency_key) values(p_id,b.id,a.id,v_pago,gen_random_uuid()) on conflict(liquidation_id,beneficiary_id,secuencia_beneficiario) do update set valor=public.payment_orders.valor+excluded.valor returning id into v_order;
       insert into public.payment_items(payment_order_id,operation_id,concepto,valor) values(v_order,o.id,case when o.tipo_establecimiento='aliado' then 'pago_aliado' else 'pago_tienda' end,v_pago);
     end if;
   end if;
  end if;
  v_tot_comercial:=v_tot_comercial+v_comercial;v_tot_bonus:=v_tot_bonus+v_bonus;v_tot_util:=v_tot_util+v_util;
  if o.tipo_establecimiento='aliado' then v_tot_aliados:=v_tot_aliados+v_pago;v_count_aliados:=v_count_aliados+1;else v_tot_tiendas:=v_tot_tiendas+v_pago;v_util_tiendas:=v_util_tiendas+v_util;v_count_tiendas:=v_count_tiendas+1;end if;
 end loop;

 for bn in select * from public.liquidation_bonuses where liquidation_id=p_id and estado='aprobado' loop
  select * into a from public.beneficiary_bank_accounts where beneficiary_id=bn.beneficiary_id and activo and validada order by validada_at desc limit 1;
  if not found then
    insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion) values(p_id,bn.operation_id,'bono_beneficiario_sin_cuenta','El beneficiario del bono no tiene cuenta bancaria validada. No bloquea el cálculo; falta antes de poder girar el pago.',false) on conflict do nothing;
  else
    insert into public.payment_orders(liquidation_id,beneficiary_id,bank_account_id,valor,idempotency_key) values(p_id,bn.beneficiary_id,a.id,bn.valor,gen_random_uuid()) on conflict(liquidation_id,beneficiary_id,secuencia_beneficiario) do update set valor=public.payment_orders.valor+excluded.valor returning id into v_order;
    insert into public.payment_items(payment_order_id,operation_id,bonus_id,concepto,valor) values(v_order,bn.operation_id,bn.id,'bono_'||bn.tipo_bono,bn.valor);
  end if;
 end loop;
 -- Conservar también los resultados conocidos cuando otra fila necesita corrección.
 -- Los controles de aprobación/pago permanecen separados y no se eluden.
 update public.liquidations set estado=case when (select count(*) from public.liquidation_calculations where liquidation_id=p_id)=(select count(*) from public.liquidation_operations where liquidation_id=p_id) then 'calculada' else 'con_novedades' end,total_operaciones=v_tot_comercial,total_pago_aliados=v_tot_aliados,total_pago_tiendas=v_tot_tiendas,total_bonos=v_tot_bonus,total_utilidad_creditek=v_tot_util,total_utilidad_tiendas=v_util_tiendas,total_pagar=v_tot_aliados+v_tot_tiendas+v_tot_bonus,operaciones_tiendas=v_count_tiendas,operaciones_aliados=v_count_aliados,updated_at=now() where id=p_id returning * into v;
 insert into public.liquidation_domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key) values('liquidation.calculated','liquidation',p_id,jsonb_build_object('liquidation_id',p_id,'platform',v.plataforma),p_id||':calculated') on conflict(idempotency_key) do nothing;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'aliados_liquidacion_calculada','liquidations',p_id,jsonb_build_object('total_pagar',v.total_pagar,'policy_effective_from','2026-08-05'));return v;
end; 
$function$
;
REVOKE ALL ON FUNCTION liquidaciones_api_private.calcular_liquidacion_sin_datos_pago(p_id uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION liquidaciones_api_private.calcular_liquidacion_sin_datos_pago(p_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.aliados_impedir_cambio_aprobado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if TG_OP='UPDATE' and exists(select 1 from kora_private.rectificaciones_krediya r
  where r.liquidation_id=old.id and r.permit_transaction=txid_current() and r.completed_at is null)
  and (to_jsonb(old)-array['total_bonos','total_utilidad_creditek','total_utilidad_tiendas','total_pagar','updated_at'])
   =(to_jsonb(new)-array['total_bonos','total_utilidad_creditek','total_utilidad_tiendas','total_pagar','updated_at'])
 then return new; end if;
 
 if exists(select 1 from kora_private.bonos_diferidos d where d.liquidation_id=old.id and d.permit_transaction=txid_current() and d.completed_at is null)
  and (to_jsonb(old)-array['total_bonos','total_utilidad_creditek','total_pagar','updated_at'])=(to_jsonb(new)-array['total_bonos','total_utilidad_creditek','total_pagar','updated_at']) then return new; end if;
 if old.frozen_at is not null and (old.plataforma,old.periodo_desde,old.periodo_hasta,old.fecha_corte,old.total_operaciones,old.total_pago_aliados,old.total_bonos,old.total_utilidad_creditek,old.total_pagar)
   is distinct from (new.plataforma,new.periodo_desde,new.periodo_hasta,new.fecha_corte,new.total_operaciones,new.total_pago_aliados,new.total_bonos,new.total_utilidad_creditek,new.total_pagar)
 then raise exception 'Liquidación aprobada inmutable; use ajuste o reversión formal'; end if;return new;
end; $function$
;
REVOKE ALL ON FUNCTION public.aliados_impedir_cambio_aprobado() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.aliados_impedir_cambio_aprobado() TO service_role;

CREATE OR REPLACE FUNCTION public.tesoreria_generar_destinos_liquidacion(p_liquidation_id uuid)
 RETURNS liquidation_treasury_destinations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare l public.liquidations%rowtype;o public.liquidation_operations%rowtype;destination public.liquidation_treasury_destinations%rowtype;
 comp public.retail_b2b_compensations%rowtype;bank public.beneficiary_bank_accounts%rowtype;beneficiary public.liquidation_beneficiaries%rowtype;
 received numeric:=0;allies numeric:=0;executives numeric:=0;b2b numeric:=0;commission numeric:=0;right_value numeric;comp_value numeric;commission_value numeric;
 op_base numeric;op_bonus numeric;
 account_before numeric;account_after numeric;balance_data jsonb;movement_id uuid;
begin
 if not public.tiene_capacidad_aliados('aprobador') then raise exception 'Solo Óscar/aprobador puede generar destinos';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_liquidation_id::text,0));
 select * into destination from public.liquidation_treasury_destinations where liquidation_id=p_liquidation_id;
 if found then return destination;end if;
 select * into l from public.liquidations where id=p_liquidation_id for update;
 if not found or l.estado<>'aprobada' or l.frozen_at is null then raise exception 'La liquidación debe estar aprobada e inmutable';end if;

 for o in select * from public.liquidation_operations where liquidation_id=l.id and operation_at::date>=date '2026-08-05' and (l.plataforma<>'krediya' or reconocida)
    order by case when l.plataforma='krediya'
      and policy_snapshot->'krediya_v2'->>'motor'='krediya_v2'
      and (policy_snapshot->'krediya_v2'->>'pvp_liquidado')::numeric
        < (policy_snapshot->'krediya_v2'->>'pagamos')::numeric
      then 1 else 0 end, id loop
  if o.valor_comercial is null or (o.porcentaje_politica is null and coalesce(o.policy_snapshot->'krediya_v2'->>'motor','')<>'krediya_v2') or o.policy_snapshot is null then raise exception 'Operación sin cálculo o política congelada';end if;
  received:=received+coalesce(o.monto_credito,o.monto_base);
  op_base:=coalesce(o.monto_credito,o.monto_base);
  if l.plataforma='krediya' and o.policy_snapshot->'krediya_v2'->>'motor'='krediya_v2' then
    right_value:=(o.policy_snapshot->'krediya_v2'->>'pagamos')::numeric;
   elsif l.plataforma='alo' then right_value:=o.pagamos; else right_value:=round(op_base*o.porcentaje_politica,2); end if;
  select coalesce(sum(valor),0) into op_bonus from public.liquidation_bonuses where operation_id=o.id and estado='aprobado';
  if l.plataforma='krediya' and o.policy_snapshot->'krediya_v2'->>'motor'='krediya_v2' then
    commission_value:=round(
      (o.policy_snapshot->'krediya_v2'->>'pvp_liquidado')::numeric
      - (o.policy_snapshot->'krediya_v2'->>'pagamos')::numeric, 2);
   elsif l.plataforma='alo' then commission_value:=o.utilidad_creditek; else commission_value:=round(op_base-right_value-op_bonus,2); end if;
  if l.plataforma<>'krediya' and exists(select 1 from kora_private.bonos_diferidos d where d.operation_id=o.id and d.completed_at is null) then commission_value:=0; end if;
  commission:=commission+commission_value;
  if o.tipo_establecimiento='propia' then
   comp_value:=round(right_value-o.inicial,2);if comp_value<0 then raise exception 'Compensación Retail inválida';end if;
   select coalesce(sum(case when tipo='cargo' then monto else -monto end),0) into account_before from public.cuenta_corriente where tienda_codigo=o.origen_codigo;
   account_after:=account_before-comp_value;
   insert into public.retail_b2b_compensations(liquidation_id,operation_id,store_code,platform,cutoff_date,imei,commercial_value,initial_value,policy_percentage,compensation_value,outsourcing_commission,account_balance_before,account_balance_after,created_by)
   values(l.id,o.id,o.origen_codigo,l.plataforma,l.fecha_corte,o.imei,o.valor_comercial,o.inicial,coalesce(o.porcentaje_politica,right_value/nullif(op_base,0)),comp_value,commission_value,account_before,account_after,auth.uid())
   on conflict(operation_id) do nothing returning * into comp;
   if comp.id is not null then
    insert into public.liquidation_domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key) values('treasury.compensation_created','liquidation',l.id,jsonb_build_object('liquidation_id',l.id,'store_code',o.origen_codigo,'amount',comp_value),o.id||':treasury_compensation') on conflict(idempotency_key) do nothing;
   end if;b2b:=b2b+comp_value;
  end if;
  if commission_value>0 or (
      l.plataforma='krediya'
      and o.policy_snapshot->'krediya_v2'->>'motor'='krediya_v2'
      and commission_value<0
    ) then
   if commission_value<0 then
      select balance into account_before from public.treasury_unit_balances
        where unit='tercerizacion' for update;
      if account_before is null or account_before<abs(commission_value) then
        raise exception 'Saldo insuficiente para cubrir el margen negativo de Krediya. Disponible: %, pérdida: %',
          coalesce(account_before,0), abs(commission_value);
      end if;
    end if;
    balance_data:=public.tesoreria_aplicar_saldo(
      'tercerizacion', case when commission_value>0 then 'credit' else 'debit' end,
      abs(commission_value), 'commission-operation:'||o.id);
   insert into public.treasury_movements(unit,direction,type,concept,amount,movement_date,liquidation_id,balance_before,balance_after,status,requested_by,idempotency_key)
   values('tercerizacion',case when commission_value>0 then 'credit' else 'debit' end,
      case when o.tipo_establecimiento='propia' then 'comision_retail' else 'comision_aliado' end,
    (case
        when l.plataforma='krediya' and o.policy_snapshot->'krediya_v2'->>'motor'='krediya_v2'
        then case when commission_value<0
          then 'Pérdida de margen Krediya antes de bonos y gastos — '
          else 'Margen Krediya antes de bonos y gastos — ' end
        else 'Comisión de Tercerización — '
      end)||case when o.tipo_establecimiento='propia' then 'Retail' else 'Aliados' end||' — '||l.plataforma||' — corte '||coalesce(l.fecha_corte::text,'sin fecha'),
    abs(commission_value),coalesce(l.fecha_corte,current_date),l.id,(balance_data->>'before')::numeric,(balance_data->>'after')::numeric,'pagado',auth.uid(),'commission-operation:'||o.id);
  end if;
 end loop;

 for beneficiary in select distinct b.* from public.payment_orders po join public.liquidation_beneficiaries b on b.id=po.beneficiary_id where po.liquidation_id=l.id loop
  select * into bank from public.beneficiary_bank_accounts where beneficiary_id=beneficiary.id and activo and validada order by validada_at desc limit 1;
  if not found then
    insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion)
    select l.id, null, 'beneficiario_sin_cuenta_pendiente', 'Falta cargar la cuenta bancaria de '||beneficiary.nombre||' para poder completar su pago. No bloquea la aprobación.', false
    where not exists(select 1 from liquidation_incidents where liquidation_id=l.id and tipo='beneficiario_sin_cuenta_pendiente' and descripcion like '%'||beneficiary.nombre||'%');
    continue;
  end if;
  update public.payment_orders po set payment_kind=case when beneficiary.tipo='ejecutivo' then 'ejecutivo' else 'aliado' end,
   concept=case when beneficiary.tipo='ejecutivo' then 'Bonos y comisiones — '||l.plataforma||' — corte '||coalesce(l.fecha_corte::text,'sin fecha') else 'Pago de '||(select count(distinct pi.operation_id) from public.payment_items pi where pi.payment_order_id=po.id)||' créditos '||case when l.plataforma='alo' then 'ALO Credit' when l.plataforma='krediya' then 'Krediya' else 'PayJoy' end||' — corte '||coalesce(l.fecha_corte::text,'sin fecha') end,
   cutoff_snapshot=l.fecha_corte,platform_snapshot=l.plataforma,operations_count=(select count(distinct pi.operation_id) from public.payment_items pi where pi.payment_order_id=po.id),
   commercial_value=coalesce((select sum(liq_op.valor_comercial) from public.payment_items pi join public.liquidation_operations liq_op on liq_op.id=pi.operation_id where pi.payment_order_id=po.id),0),
   own_bonuses=coalesce((select sum(pi.valor) from public.payment_items pi where pi.payment_order_id=po.id and pi.bonus_id is not null),0),
   bank_snapshot=jsonb_build_object('bank',bank.banco,'account_type',bank.tipo_cuenta,'account_number',bank.numero_cuenta,'holder',beneficiary.nombre,'holder_identification',beneficiary.identificacion)
  where po.liquidation_id=l.id and po.beneficiary_id=beneficiary.id;
 end loop;
 select coalesce(sum(po.valor),0) into allies from public.payment_orders po join public.liquidation_beneficiaries b on b.id=po.beneficiary_id where po.liquidation_id=l.id and b.tipo='aliado';
 select coalesce(sum(po.valor),0) into executives from public.payment_orders po join public.liquidation_beneficiaries b on b.id=po.beneficiary_id where po.liquidation_id=l.id and b.tipo='ejecutivo';
 allies:=coalesce(l.total_pago_aliados,0);executives:=coalesce(l.total_bonos,0);
 insert into public.liquidation_treasury_destinations(liquidation_id,received_from_platform,total_allies,total_executives,total_b2b_compensations,total_outsourcing_commission,generated_by)
 values(l.id,received,allies,executives,b2b,commission,auth.uid()) returning * into destination;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'tesoreria_destinos_generados','liquidations',l.id,jsonb_build_object('received',received,'allies',allies,'executives',executives,'b2b',b2b,'outsourcing_commission',commission));
 return destination;
end;
$function$
;
REVOKE ALL ON FUNCTION public.tesoreria_generar_destinos_liquidacion(p_liquidation_id uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tesoreria_generar_destinos_liquidacion(p_liquidation_id uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.aliados_impedir_cambio_operacion_aprobada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if TG_OP='UPDATE' and exists(select 1 from kora_private.rectificaciones_krediya r
  where r.liquidation_id=old.liquidation_id and r.permit_transaction=txid_current() and r.completed_at is null)
  and (to_jsonb(old)-array['bonos_aplicados','utilidad_creditek','utilidad_creditek_tienda','policy_snapshot'])
   =(to_jsonb(new)-array['bonos_aplicados','utilidad_creditek','utilidad_creditek_tienda','policy_snapshot'])
 then return new; end if;
 
 if TG_OP='UPDATE' and exists(select 1 from kora_private.bonos_diferidos d where d.operation_id=old.id and d.permit_transaction=txid_current() and d.completed_at is null)
  and (to_jsonb(old)-array['ejecutivo_id','bonos_aplicados','utilidad_creditek'])=(to_jsonb(new)-array['ejecutivo_id','bonos_aplicados','utilidad_creditek']) then return new; end if;
 if exists(select 1 from public.liquidations where id=old.liquidation_id and frozen_at is not null) then raise exception 'Liquidación aprobada inmutable; los snapshots no pueden cambiar';end if;
 if TG_OP = 'DELETE' then return old; else return new; end if;
end;
$function$
;
REVOKE ALL ON FUNCTION public.aliados_impedir_cambio_operacion_aprobada() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.aliados_impedir_cambio_operacion_aprobada() TO service_role;

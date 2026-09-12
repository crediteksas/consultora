-- La aprobación prepara el abono; Gestión lo aplica y la tienda acusa recibo.
ALTER TABLE public.retail_b2b_compensations
 ADD COLUMN applied_at timestamptz,
 ADD COLUMN applied_by uuid REFERENCES public.perfiles(id),
 ADD COLUMN accepted_at timestamptz,
 ADD COLUMN accepted_by uuid REFERENCES public.perfiles(id),
 ADD COLUMN legacy_applied boolean NOT NULL DEFAULT false,
 ADD CONSTRAINT compensation_acceptance_requires_application CHECK
   (accepted_at IS NULL OR (applied_at IS NOT NULL AND accepted_by IS NOT NULL));

-- No se crean ni se borran movimientos históricos. Abortamos ante cualquier cruce ambiguo.
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.retail_b2b_compensations c WHERE c.reversed_at IS NULL AND
  (SELECT count(*) FROM public.cuenta_corriente cc WHERE cc.referencia_tipo='compensacion_liquidacion_retail'
   AND cc.referencia_id=c.id::text AND cc.tipo='abono' AND cc.tienda_codigo=c.store_code
   AND cc.monto=c.compensation_value)<>1) THEN
  RAISE EXCEPTION 'Existen compensaciones históricas sin un abono inequívoco; conciliar antes de migrar';
 END IF;
END $$;
UPDATE public.retail_b2b_compensations c SET
 applied_at=cc.created_at,applied_by=cc.usuario,legacy_applied=true
 FROM public.cuenta_corriente cc
 WHERE cc.referencia_tipo='compensacion_liquidacion_retail' AND cc.referencia_id=c.id::text
 AND cc.tipo='abono' AND cc.tienda_codigo=c.store_code AND cc.monto=c.compensation_value;

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

CREATE SCHEMA IF NOT EXISTS compensaciones_private;
REVOKE ALL ON SCHEMA compensaciones_private FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA compensaciones_private TO authenticated;
CREATE FUNCTION compensaciones_private.aplicar(p_ids uuid[]) RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.perfiles; c public.retail_b2b_compensations;
 before_value numeric; b jsonb; total integer:=0; k uuid;
BEGIN
 SELECT * INTO p FROM public.perfiles WHERE id=auth.uid() AND activo;
 IF p.id IS NULL OR p.rol NOT IN ('gerencia','auditoria') OR p.rol IS NULL
  OR NOT coalesce(public.tiene_capacidad_aliados('revisor'),false)
 THEN RAISE EXCEPTION 'Solo Gestión o Gerencia autorizada puede aplicar abonos'; END IF;
 IF coalesce(cardinality(p_ids),0)=0 OR cardinality(p_ids)>200 OR array_position(p_ids,NULL) IS NOT NULL
 THEN RAISE EXCEPTION 'Selecciona entre 1 y 200 abonos'; END IF;
 -- Orden estable para selecciones simultáneas.
 FOR k IN SELECT DISTINCT unnest(p_ids) ORDER BY 1 LOOP
  SELECT * INTO c FROM public.retail_b2b_compensations WHERE id=k FOR UPDATE;
  IF c.id IS NULL OR c.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'Abono no disponible'; END IF;
  IF c.applied_at IS NOT NULL THEN CONTINUE; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.liquidations l WHERE l.id=c.liquidation_id
    AND l.estado IN ('aprobada','pagada','cerrada') AND l.frozen_at IS NOT NULL)
  THEN RAISE EXCEPTION 'La liquidación no está autorizada'; END IF;
  IF EXISTS(SELECT 1 FROM public.cuenta_corriente WHERE referencia_tipo='compensacion_liquidacion_retail'
    AND referencia_id=c.id::text) THEN RAISE EXCEPTION 'Existe un movimiento previo: conciliar, no duplicar'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('compensation-store:'||c.store_code,0));
  SELECT coalesce(sum(CASE WHEN tipo='cargo' THEN monto ELSE -monto END),0) INTO before_value
    FROM public.cuenta_corriente WHERE tienda_codigo=c.store_code;
  INSERT INTO public.cuenta_corriente(tienda_codigo,tipo,concepto,monto,referencia_tipo,referencia_id,usuario)
  VALUES(c.store_code,'abono','Compensación liquidación Retail — '||
    CASE c.platform WHEN 'alo' THEN 'ALO Credit' WHEN 'krediya' THEN 'Krediya' ELSE 'PayJoy' END||
    ' — corte '||coalesce(c.cutoff_date::text,'sin fecha'),c.compensation_value,
    'compensacion_liquidacion_retail',c.id::text,auth.uid());
  IF c.compensation_value>0 THEN
   b:=public.tesoreria_aplicar_saldo('b2b','credit',c.compensation_value,'compensation:'||c.id);
   INSERT INTO public.treasury_movements(unit,direction,type,beneficiary,concept,amount,movement_date,
     liquidation_id,compensation_id,balance_before,balance_after,status,requested_by,idempotency_key)
   VALUES('b2b','credit','compensacion_retail',c.store_code,'Compensación aplicada por Gestión — '||c.platform,
    c.compensation_value,(now() AT TIME ZONE 'America/Bogota')::date,c.liquidation_id,c.id,
    (b->>'before')::numeric,(b->>'after')::numeric,'pagado',auth.uid(),'compensation:'||c.id);
  END IF;
  UPDATE public.retail_b2b_compensations SET applied_at=now(),applied_by=auth.uid(),
    account_balance_before=before_value,account_balance_after=before_value-c.compensation_value WHERE id=c.id;
  INSERT INTO public.audit_log(usuario,accion,tabla,registro_id,detalle)
   VALUES(auth.uid(),'compensacion_aplicada_gestion','retail_b2b_compensations',c.id,
    jsonb_build_object('tienda',c.store_code,'imei',c.imei,'monto',c.compensation_value,
      'saldo_antes',before_value,'saldo_despues',before_value-c.compensation_value));
  total:=total+1;
 END LOOP;
 RETURN total;
END $$;
CREATE FUNCTION compensaciones_private.aceptar(p_id uuid) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.perfiles; c public.retail_b2b_compensations;
BEGIN
 SELECT * INTO p FROM public.perfiles WHERE id=auth.uid() AND activo;
 SELECT * INTO c FROM public.retail_b2b_compensations WHERE id=p_id FOR UPDATE;
 IF p.id IS NULL OR NOT coalesce(p.rol='admin_tienda' AND p.tienda_codigo=c.store_code,false)
 THEN RAISE EXCEPTION 'Solo la administración de la tienda puede aceptar su abono'; END IF;
 IF c.applied_at IS NULL OR c.reversed_at IS NOT NULL OR c.legacy_applied
 THEN RAISE EXCEPTION 'No hay un abono nuevo aplicado pendiente de aceptación'; END IF;
 IF c.accepted_at IS NOT NULL THEN RETURN false; END IF;
 UPDATE public.retail_b2b_compensations SET accepted_at=now(),accepted_by=auth.uid() WHERE id=c.id;
 INSERT INTO public.audit_log(usuario,accion,tabla,registro_id,detalle)
  VALUES(auth.uid(),'compensacion_aceptada_tienda','retail_b2b_compensations',c.id,
   jsonb_build_object('tienda',c.store_code,'imei',c.imei,'monto',c.compensation_value));
 RETURN true;
END $$;
CREATE FUNCTION compensaciones_private.recibidas(p_tienda text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.perfiles p WHERE p.id=auth.uid() AND p.activo
  AND (p.rol IN ('gerencia','auditoria') OR (p.rol='admin_tienda' AND p.tienda_codigo=p_tienda)))
 THEN RAISE EXCEPTION 'Tienda no autorizada'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'platform',c.platform,'imei',c.imei,
  'cutoff_date',c.cutoff_date,'amount',c.compensation_value,'applied_at',c.applied_at,
  'applied_by',p.nombre,'accepted_at',c.accepted_at) ORDER BY c.applied_at DESC),'[]'::jsonb)
  FROM public.retail_b2b_compensations c LEFT JOIN public.perfiles p ON p.id=c.applied_by
  WHERE c.store_code=p_tienda AND c.applied_at IS NOT NULL AND c.reversed_at IS NULL
    AND NOT c.legacy_applied AND c.accepted_at IS NULL);
END $$;
REVOKE ALL ON FUNCTION compensaciones_private.aplicar(uuid[]),compensaciones_private.aceptar(uuid),
 compensaciones_private.recibidas(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION compensaciones_private.aplicar(uuid[]),compensaciones_private.aceptar(uuid),
 compensaciones_private.recibidas(text) TO authenticated;
CREATE FUNCTION public.aplicar_compensaciones_gestion(p_ids uuid[]) RETURNS integer
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT compensaciones_private.aplicar(p_ids) $$;
CREATE FUNCTION public.aceptar_compensacion_tienda(p_id uuid) RETURNS boolean
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT compensaciones_private.aceptar(p_id) $$;
CREATE FUNCTION public.compensaciones_recibidas_tienda(p_tienda text) RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT compensaciones_private.recibidas(p_tienda) $$;
REVOKE ALL ON FUNCTION public.aplicar_compensaciones_gestion(uuid[]),public.aceptar_compensacion_tienda(uuid),
 public.compensaciones_recibidas_tienda(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aplicar_compensaciones_gestion(uuid[]),public.aceptar_compensacion_tienda(uuid),
 public.compensaciones_recibidas_tienda(text) TO authenticated;

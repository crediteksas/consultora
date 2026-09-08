-- Rectificación formal autorizada. No reabre lotes ni regenera pagos.
BEGIN;
CREATE TABLE IF NOT EXISTS kora_private.rectificaciones_krediya (
 liquidation_id uuid PRIMARY KEY REFERENCES public.liquidations(id),
 permit_transaction bigint,
 before_data jsonb NOT NULL,
 after_data jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
ALTER TABLE kora_private.rectificaciones_krediya ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON kora_private.rectificaciones_krediya FROM PUBLIC,anon,authenticated,service_role;

-- Las excepciones requieren un permiso privado de ESTA transacción y solo
-- permiten campos derivados. Ningún cliente/API puede crear estos permisos.
DO $guards$
DECLARE definition text; guard text; target text;
BEGIN
 FOREACH target IN ARRAY ARRAY['aliados_impedir_cambio_aprobado','aliados_impedir_cambio_operacion_aprobada'] LOOP
  SELECT pg_get_functiondef(to_regprocedure('public.'||target||'()')) INTO definition;
  IF definition IS NULL THEN RAISE EXCEPTION 'Falta guarda %',target; END IF;
  IF position('kora_private.rectificaciones_krediya' IN definition)>0 THEN CONTINUE; END IF;
  IF target='aliados_impedir_cambio_aprobado' THEN
   guard:=$g$
 if TG_OP='UPDATE' and exists(select 1 from kora_private.rectificaciones_krediya r
  where r.liquidation_id=old.id and r.permit_transaction=txid_current() and r.completed_at is null)
  and (to_jsonb(old)-array['total_bonos','total_utilidad_creditek','total_utilidad_tiendas','total_pagar','updated_at'])
   =(to_jsonb(new)-array['total_bonos','total_utilidad_creditek','total_utilidad_tiendas','total_pagar','updated_at'])
 then return new; end if;
 $g$;
  ELSE
   guard:=$g$
 if TG_OP='UPDATE' and exists(select 1 from kora_private.rectificaciones_krediya r
  where r.liquidation_id=old.liquidation_id and r.permit_transaction=txid_current() and r.completed_at is null)
  and (to_jsonb(old)-array['bonos_aplicados','utilidad_creditek','utilidad_creditek_tienda','policy_snapshot'])
   =(to_jsonb(new)-array['bonos_aplicados','utilidad_creditek','utilidad_creditek_tienda','policy_snapshot'])
 then return new; end if;
 $g$;
  END IF;
  IF definition !~* '\mbegin\M' THEN RAISE EXCEPTION 'Guarda inesperada %',target; END IF;
  EXECUTE regexp_replace(definition,'\mbegin\M','begin'||guard,'i');
 END LOOP;
END $guards$;

CREATE OR REPLACE FUNCTION kora_private.rectificar_krediya_bonos_20260908(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $function$
DECLARE l public.liquidations%rowtype; o public.liquidation_operations%rowtype;
 archive jsonb; result jsonb; snap jsonb; delta jsonb;
 bonuses numeric; financial numeric; gross numeric; provision numeric; net numeric;
 invalid_count integer; invalid_total numeric; pending_total numeric; paid_excess numeric;
 old_paid jsonb; old_items jsonb; old_treasury jsonb; affected integer;
BEGIN
 SELECT * INTO l FROM public.liquidations WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR l.plataforma<>'krediya' OR l.fecha_corte<>date '2026-08-30'
  OR l.frozen_at IS NULL THEN RAISE EXCEPTION 'No es el lote autorizado'; END IF;
 SELECT after_data INTO result FROM kora_private.rectificaciones_krediya WHERE liquidation_id=p_id AND completed_at IS NOT NULL;
 IF FOUND THEN
  IF l.total_bonos<>1100000 THEN RAISE EXCEPTION 'La rectificación existente no coincide'; END IF;
  RETURN result;
 END IF;
 PERFORM 1 FROM public.liquidation_operations WHERE liquidation_id=p_id ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.payment_orders WHERE liquidation_id=p_id ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.liquidation_bonuses WHERE liquidation_id=p_id ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.payment_items WHERE payment_order_id IN(SELECT id FROM public.payment_orders WHERE liquidation_id=p_id) ORDER BY id FOR UPDATE;
 IF l.total_bonos<>1460000 OR (SELECT count(*) FROM public.liquidation_operations WHERE liquidation_id=p_id)<>29
  OR (SELECT count(*) FROM public.liquidation_operations WHERE liquidation_id=p_id AND tipo_establecimiento='aliado' AND reconocida)<>22
  OR (SELECT count(*) FROM public.liquidation_operations WHERE liquidation_id=p_id AND tipo_establecimiento='propia' AND reconocida)<>7
 THEN RAISE EXCEPTION 'El lote cambió: requiere nueva comprobación'; END IF;
 IF EXISTS(SELECT 1 FROM public.payment_orders WHERE liquidation_id=p_id AND estado NOT IN('pagado','pendiente'))
 THEN RAISE EXCEPTION 'Orden en estado no previsto'; END IF;

 SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) INTO old_paid FROM public.payment_orders p WHERE liquidation_id=p_id AND estado='pagado';
 SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) INTO old_items FROM public.payment_items i JOIN public.payment_orders p ON p.id=i.payment_order_id WHERE p.liquidation_id=p_id AND p.estado='pagado';
 SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) INTO old_treasury FROM public.treasury_movements m WHERE liquidation_id=p_id;
 SELECT jsonb_build_object('liquidation',to_jsonb(l),
  'operations',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.liquidation_operations x WHERE liquidation_id=p_id),
  'bonuses',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.liquidation_bonuses x WHERE liquidation_id=p_id),
  'calculations',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.liquidation_calculations x WHERE liquidation_id=p_id),
  'orders',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.payment_orders x WHERE liquidation_id=p_id),
  'items',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.payment_items x JOIN public.payment_orders p ON p.id=x.payment_order_id WHERE p.liquidation_id=p_id),
  'destinations',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.liquidation_treasury_destinations x WHERE liquidation_id=p_id)) INTO archive;
 INSERT INTO kora_private.rectificaciones_krediya(liquidation_id,permit_transaction,before_data)
 VALUES(p_id,txid_current(),archive);

 SELECT count(*),sum(b.valor) INTO invalid_count,invalid_total
 FROM public.liquidation_bonuses b JOIN public.liquidation_operations op ON op.id=b.operation_id
 WHERE b.liquidation_id=p_id AND b.estado='aprobado'
 AND (b.tipo_bono='automatico_override' OR (op.tipo_establecimiento='propia' AND b.tipo_bono IN('krediya_gestion','krediya_operacion')));
 IF invalid_count<>36 OR invalid_total<>360000 THEN RAISE EXCEPTION 'Bonos a rectificar distintos del diagnóstico'; END IF;
 -- Conservar el importe original y el vínculo con pagos; anular el DEVENGO incorrecto.
 UPDATE public.liquidation_bonuses b SET estado='anulado',
  motivo=coalesce(b.motivo,'')||' · Rectificación autorizada 2026-09-08: no corresponde por regla Krediya; pagos originales conservados.',
  rule_snapshot=coalesce(b.rule_snapshot,'{}'::jsonb)||jsonb_build_object('rectificacion','krediya_bonos_20260908')
 FROM public.liquidation_operations op WHERE op.id=b.operation_id AND b.liquidation_id=p_id AND b.estado='aprobado'
 AND (b.tipo_bono='automatico_override' OR (op.tipo_establecimiento='propia' AND b.tipo_bono IN('krediya_gestion','krediya_operacion')));
 IF (SELECT sum(valor) FROM public.liquidation_bonuses WHERE liquidation_id=p_id AND estado='aprobado')<>1100000
  OR (SELECT count(*) FROM public.liquidation_bonuses WHERE liquidation_id=p_id AND estado='aprobado')<>66
 THEN RAISE EXCEPTION 'Los bonos activos no cuadran'; END IF;

 FOR o IN SELECT * FROM public.liquidation_operations WHERE liquidation_id=p_id ORDER BY id LOOP
  snap:=o.policy_snapshot->'krediya_v2';
  IF snap->>'motor' IS DISTINCT FROM 'krediya_v2'
   OR (snap->>'pvp_liquidado')::numeric IS DISTINCT FROM o.valor_comercial
   OR (snap->>'pagamos')::numeric IS DISTINCT FROM o.pagamos
   OR (snap->>'tasa_gasto_financiero')::numeric IS DISTINCT FROM 0.004::numeric
   OR (snap->>'provision_porcentaje')::numeric IS DISTINCT FROM 0.28::numeric
   OR o.monto_credito IS NULL OR o.pagamos IS NULL THEN RAISE EXCEPTION 'Snapshot incompleto: %',o.id; END IF;
  SELECT coalesce(sum(valor),0) INTO bonuses FROM public.liquidation_bonuses WHERE operation_id=o.id AND estado='aprobado';
  financial:=round(o.monto_credito*0.004,2);
  gross:=round(o.valor_comercial-o.pagamos-bonuses-financial,2);
  provision:=round(gross*0.28,2); net:=gross-provision;
  snap:=snap||jsonb_build_object('bonos',bonuses,'gasto_financiero',financial,'utilidad_bruta',gross,
   'provision',provision,'utilidad_neta',net,'rectificacion','krediya_bonos_20260908','rectificado_at',now(),
   'impacto_neto',net-((snap->>'pvp_guardado')::numeric-o.pagamos-bonuses-financial-round(((snap->>'pvp_guardado')::numeric-o.pagamos-bonuses-financial)*0.28,2)));
  UPDATE public.liquidation_operations SET bonos_aplicados=bonuses,utilidad_creditek=net,
   utilidad_creditek_tienda=CASE WHEN tipo_establecimiento='propia' THEN net ELSE utilidad_creditek_tienda END,
   policy_snapshot=jsonb_set(policy_snapshot,'{krediya_v2}',snap) WHERE id=o.id;
  UPDATE public.liquidation_calculations SET total_bonos=bonuses,utilidad_creditek=net,
   policy_snapshot=snap,explanation=coalesce(explanation,'{}'::jsonb)||snap,calculated_at=now()
   WHERE liquidation_id=p_id AND operation_id=o.id;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'Número inesperado de cálculos: %',o.id; END IF;
  UPDATE public.krediya_diferencias SET contexto=coalesce(contexto,'{}'::jsonb)||snap,updated_at=now() WHERE operation_id=o.id;
 END LOOP;

 -- Solo retirar detalle incorrecto de la orden NO pagada; copia original en archivo privado.
 DELETE FROM public.payment_items i USING public.payment_orders p,public.liquidation_bonuses b
 WHERE p.id=i.payment_order_id AND b.id=i.bonus_id AND p.liquidation_id=p_id AND p.estado='pendiente'
  AND b.estado='anulado' AND b.rule_snapshot->>'rectificacion'='krediya_bonos_20260908';
 UPDATE public.payment_orders p SET valor=(SELECT coalesce(sum(i.valor),0) FROM public.payment_items i WHERE i.payment_order_id=p.id),updated_at=now()
 WHERE p.liquidation_id=p_id AND p.estado='pendiente';
 SELECT sum(valor) INTO pending_total FROM public.payment_orders WHERE liquidation_id=p_id AND estado='pendiente';
 IF pending_total<>330000 OR (SELECT count(*) FROM public.payment_orders WHERE liquidation_id=p_id AND estado='pendiente')<>1 THEN RAISE EXCEPTION 'Pendiente distinto de 330.000'; END IF;

 UPDATE public.liquidations SET total_bonos=1100000,
  total_utilidad_creditek=(SELECT sum(utilidad_creditek) FROM public.liquidation_operations WHERE liquidation_id=p_id),
  total_utilidad_tiendas=(SELECT sum(utilidad_creditek_tienda) FROM public.liquidation_operations WHERE liquidation_id=p_id AND tipo_establecimiento='propia'),
  total_pagar=total_pago_aliados+1100000,updated_at=now() WHERE id=p_id;
 UPDATE public.liquidation_treasury_destinations SET total_executives=1100000 WHERE liquidation_id=p_id;
 -- Sin créditos de caja: el exceso registrado como pagado NO ha regresado al banco.
 SELECT jsonb_agg(jsonb_build_object('payment_order_id',p.id,'beneficiary_id',p.beneficiary_id,
  'nombre',b.nombre,'pagado',p.valor,'bono_correcto',coalesce(a.correcto,0),
  'diferencia',p.valor-coalesce(a.correcto,0),'estado','pendiente_validacion_soporte') ORDER BY p.id),
  sum(p.valor-coalesce(a.correcto,0)) INTO delta,paid_excess
 FROM public.payment_orders p JOIN public.liquidation_beneficiaries b ON b.id=p.beneficiary_id
 LEFT JOIN(SELECT beneficiary_id,sum(valor) correcto FROM public.liquidation_bonuses WHERE liquidation_id=p_id AND estado='aprobado' GROUP BY beneficiary_id)a ON a.beneficiary_id=p.beneficiary_id
 WHERE p.liquidation_id=p_id AND p.estado='pagado' AND b.tipo='ejecutivo' AND p.valor>coalesce(a.correcto,0);
 IF paid_excess IS DISTINCT FROM 255000::numeric THEN RAISE EXCEPTION 'Diferencia pagada cambió'; END IF;
 IF old_paid IS DISTINCT FROM(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.payment_orders p WHERE liquidation_id=p_id AND estado='pagado')
  OR old_items IS DISTINCT FROM(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM public.payment_items i JOIN public.payment_orders p ON p.id=i.payment_order_id WHERE p.liquidation_id=p_id AND p.estado='pagado')
  OR old_treasury IS DISTINCT FROM(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.treasury_movements m WHERE liquidation_id=p_id)
 THEN RAISE EXCEPTION 'No se permite modificar pagos realizados ni movimientos de Tesorería'; END IF;
 SELECT jsonb_build_object('operaciones',29,'bonos_correctos',total_bonos,'utilidad_neta',total_utilidad_creditek,
  'total_pagar_correcto',total_pagar,'pendiente_pago',pending_total,'exceso_pagado_por_validar',paid_excess,
  'diferencias_pagos',delta,'precios_y_giros_conservados',true,'estado','numeros_rectificados_soportes_pendientes') INTO result
 FROM public.liquidations WHERE id=p_id;
 INSERT INTO public.liquidation_adjustments(liquidation_id,field_name,old_value,new_value,motivo,estado,approved_at)
 VALUES(p_id,'krediya_bonos_rectificados',jsonb_build_object('total_bonos',l.total_bonos,'utilidad_neta',l.total_utilidad_creditek,'total_pagar',l.total_pagar),
 result,'Oscar autoriza rectificación numérica completa el 2026-09-08; Mayte valida soportes después. No se declara devolución ni se compensan bonos futuros.','aprobado',now());
 INSERT INTO public.audit_log(usuario,accion,tabla,registro_id,detalle)
 VALUES('mantenimiento_autorizado_oscar','krediya_rectificacion_numerica','liquidations',p_id::text,result);
 UPDATE kora_private.rectificaciones_krediya SET after_data=result,permit_transaction=NULL,completed_at=now() WHERE liquidation_id=p_id;
 RETURN result;
END $function$;
REVOKE ALL ON FUNCTION kora_private.rectificar_krediya_bonos_20260908(uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;

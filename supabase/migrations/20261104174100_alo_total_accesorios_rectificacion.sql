-- Aló: Monto Total ya incluye accesorios. La inicial permanece separada.
DO $patch$
DECLARE d text; a text; b text;
BEGIN
 d:=pg_get_functiondef('liquidaciones_api_private.calcular_liquidacion_sin_datos_pago(uuid)'::regprocedure);
 a:='v_comercial:=coalesce(o.monto_credito,o.monto_base)+case when o.plataforma=''payjoy'' then 0 else o.inicial end;';
 b:='v_comercial:=case when o.plataforma=''alo'' then coalesce(o.monto_base,o.monto_credito+coalesce(o.accesorios,0)) else coalesce(o.monto_credito,o.monto_base) end+case when o.plataforma=''payjoy'' then 0 else o.inicial end;';
 IF strpos(d,a)=0 THEN RAISE EXCEPTION 'Motor cambió: revisar antes de aplicar'; END IF;
 d:=replace(d,a,b);
 a:='when o.plataforma=''alo'' then coalesce(o.monto_credito,o.monto_base)-v_pago-v_bonus';
 b:='when o.plataforma=''alo'' then coalesce(o.monto_base,o.monto_credito+coalesce(o.accesorios,0))-v_pago-v_bonus';
 IF strpos(d,a)=0 THEN RAISE EXCEPTION 'Utilidad cambió: revisar antes de aplicar'; END IF;
 EXECUTE replace(d,a,b);
 d:=pg_get_functiondef('public.tesoreria_generar_destinos_liquidacion(uuid)'::regprocedure);
 a:='received:=received+coalesce(o.monto_credito,o.monto_base);';
 b:='received:=received+case when l.plataforma=''alo'' then coalesce(o.monto_base,o.monto_credito+coalesce(o.accesorios,0)) else coalesce(o.monto_credito,o.monto_base) end;';
 IF strpos(d,a)=0 THEN RAISE EXCEPTION 'Destinos cambiaron: revisar antes de aplicar'; END IF;
 EXECUTE replace(d,a,b);
END $patch$;

-- Archivo privado e inmutable del antes/después; no accesible desde API.
CREATE TABLE kora_private.rectificaciones_alo_accesorios (
 operation_id uuid PRIMARY KEY REFERENCES public.liquidation_operations(id),
 liquidation_id uuid NOT NULL REFERENCES public.liquidations(id),
 permit_transaction bigint NOT NULL,
 before_data jsonb NOT NULL,
 after_data jsonb,
 completed_at timestamptz
);
ALTER TABLE kora_private.rectificaciones_alo_accesorios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON kora_private.rectificaciones_alo_accesorios FROM public,anon,authenticated,service_role;
DO $guards$
DECLARE d text; guard text; target text; fields text; key text;
BEGIN
 FOREACH target IN ARRAY ARRAY['aliados_impedir_cambio_aprobado','aliados_impedir_cambio_operacion_aprobada'] LOOP
  d:=pg_get_functiondef(('public.'||target||'()')::regprocedure);
  IF target='aliados_impedir_cambio_aprobado' THEN
   fields:='array[''total_operaciones'',''total_pago_aliados'',''total_utilidad_creditek'',''total_pagar'',''updated_at'']';key:='r.liquidation_id=old.id';
  ELSE
   fields:='array[''valor_comercial'',''pagamos'',''pago_neto_beneficiario'',''utilidad_creditek'']';key:='r.operation_id=old.id';
  END IF;
  guard:=' if TG_OP=''UPDATE'' and exists(select 1 from kora_private.rectificaciones_alo_accesorios r where '||key||' and r.permit_transaction=txid_current() and r.completed_at is null) and (to_jsonb(old)-'||fields||')=(to_jsonb(new)-'||fields||') then return new; end if; ';
  IF d !~* '\mbegin\M' THEN RAISE EXCEPTION 'Guarda no reconocida'; END IF;
  EXECUTE regexp_replace(d,'\mbegin\M','begin'||guard,'i');
 END LOOP;
END $guards$;

-- Ejecución puntual por el propietario de la BD desde herramienta administrativa; no RPC pública.
CREATE FUNCTION kora_private.rectificar_alo_accesorios(p_operation uuid,p_actor uuid,p_expected_credit numeric,p_expected_accessory numeric,p_expected_delta numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE o public.liquidation_operations%rowtype; l public.liquidations%rowtype;
 c public.liquidation_calculations%rowtype; paid public.payment_orders%rowtype;
 archive jsonb; result jsonb; v_order uuid; v_delta numeric; v_net numeric; v_gross numeric; v_utility numeric; v_seq integer; v_count integer; v_balance jsonb;
BEGIN
 SELECT * INTO o FROM public.liquidation_operations WHERE id=p_operation;
 IF NOT FOUND THEN RAISE EXCEPTION 'Operación ausente'; END IF;
 SELECT * INTO l FROM public.liquidations WHERE id=o.liquidation_id FOR UPDATE;
 SELECT * INTO o FROM public.liquidation_operations WHERE id=p_operation FOR UPDATE;
 SELECT after_data INTO result FROM kora_private.rectificaciones_alo_accesorios WHERE operation_id=o.id AND completed_at IS NOT NULL;
 IF FOUND THEN RETURN result; END IF;
 IF NOT EXISTS(select 1 from public.perfiles where id=p_actor and rol='gerencia') THEN RAISE EXCEPTION 'Actor no es Gerencia'; END IF;
 IF o.plataforma<>'alo' OR o.tipo_establecimiento<>'aliado' OR NOT o.reconocida OR l.frozen_at IS NULL
  OR l.estado NOT IN ('aprobada','programada','pagada','conciliada')
  OR o.monto_credito IS DISTINCT FROM p_expected_credit OR o.accesorios IS DISTINCT FROM p_expected_accessory
  OR o.accesorios<=0 OR o.monto_base IS DISTINCT FROM o.monto_credito+o.accesorios
  OR o.valor_comercial IS DISTINCT FROM o.monto_credito+o.inicial OR o.porcentaje_politica IS NULL
 THEN RAISE EXCEPTION 'La operación no coincide con el diagnóstico'; END IF;
 SELECT * INTO STRICT c FROM public.liquidation_calculations WHERE operation_id=o.id FOR UPDATE;
 IF c.pago_aliado IS DISTINCT FROM o.pago_neto_beneficiario OR c.utilidad_creditek IS DISTINCT FROM o.utilidad_creditek THEN RAISE EXCEPTION 'Cálculo inconsistente'; END IF;
 SELECT count(*) INTO v_count FROM public.payment_items WHERE operation_id=o.id AND concepto='pago_aliado';
 IF v_count<>1 THEN RAISE EXCEPTION 'Pago original ambiguo'; END IF;
 SELECT p.* INTO STRICT paid FROM public.payment_items i JOIN public.payment_orders p ON p.id=i.payment_order_id WHERE i.operation_id=o.id AND i.concepto='pago_aliado' FOR UPDATE OF p;
 IF paid.estado NOT IN ('pagado','conciliado') OR paid.fecha_pagada IS NULL OR nullif(paid.soporte_path,'') IS NULL
 OR (SELECT valor FROM public.payment_items WHERE operation_id=o.id AND concepto='pago_aliado') IS DISTINCT FROM o.pago_neto_beneficiario THEN RAISE EXCEPTION 'Pago no conciliable con diagnóstico'; END IF;
 IF EXISTS(select 1 from public.liquidation_adjustments where operation_id=o.id and field_name='alo_accesorios_rectificados') THEN RAISE EXCEPTION 'Existe ajuste fuera de este registro'; END IF;
 v_gross:=round((o.monto_base+o.inicial)*o.porcentaje_politica,2);
 v_net:=v_gross-o.inicial;v_delta:=v_net-o.pago_neto_beneficiario;
 v_utility:=o.monto_base-v_net-o.bonos_aplicados;
 IF v_delta IS DISTINCT FROM p_expected_delta OR v_delta<=0 THEN RAISE EXCEPTION 'Diferencia no coincide'; END IF;
 archive:=jsonb_build_object('operation',to_jsonb(o),'liquidation',to_jsonb(l),'calculation',to_jsonb(c),'paid_order',to_jsonb(paid),
 'items',(select jsonb_agg(to_jsonb(i) order by id) from public.payment_items i where payment_order_id=paid.id),
 'destinations',(select jsonb_agg(to_jsonb(d)) from public.liquidation_treasury_destinations d where liquidation_id=l.id));
 INSERT INTO kora_private.rectificaciones_alo_accesorios VALUES(o.id,l.id,txid_current(),archive,null,null);
 UPDATE public.liquidation_operations SET valor_comercial=monto_base+inicial,pagamos=v_gross,pago_neto_beneficiario=v_net,utilidad_creditek=v_utility WHERE id=o.id;
 UPDATE public.liquidation_calculations SET pagamos=v_gross,pago_aliado=v_net,utilidad_creditek=v_utility,
 explanation=explanation||jsonb_build_object('valor_comercial',o.monto_base+o.inicial,'base_calculo',o.monto_base+o.inicial,'monto_total_incluye_accesorios',o.monto_base,'rectificacion','alo_accesorios') WHERE id=c.id;
 UPDATE public.liquidations SET total_operaciones=total_operaciones+o.accesorios,total_pago_aliados=total_pago_aliados+v_delta,
 total_pagar=total_pagar+v_delta,total_utilidad_creditek=total_utilidad_creditek+v_utility-o.utilidad_creditek,updated_at=now() WHERE id=l.id;
 -- Destinos esperados: no modificar cobros confirmados ni movimientos bancarios.
 UPDATE public.liquidation_treasury_destinations SET received_from_platform=received_from_platform+o.accesorios,total_allies=total_allies+v_delta,total_outsourcing_commission=total_outsourcing_commission+v_utility-o.utilidad_creditek WHERE liquidation_id=l.id;
 -- Ajuste de comisión contable de Tercerización, nunca entrada bancaria.
 v_balance:=public.tesoreria_aplicar_saldo('tercerizacion','credit',v_utility-o.utilidad_creditek,'alo-accesorios:'||o.id);
 INSERT INTO public.treasury_movements(unit,direction,type,concept,amount,movement_date,liquidation_id,balance_before,balance_after,status,requested_by,idempotency_key)
 VALUES('tercerizacion','credit','comision_aliado','Ajuste comisión por accesorios Aló',v_utility-o.utilidad_creditek,current_date,l.id,(v_balance->>'before')::numeric,(v_balance->>'after')::numeric,'pagado',p_actor,'alo-accesorios:'||o.id);
 SELECT coalesce(max(secuencia_beneficiario),0)+1 INTO v_seq FROM public.payment_orders WHERE liquidation_id=l.id AND beneficiary_id=paid.beneficiary_id;
 INSERT INTO public.payment_orders(liquidation_id,beneficiary_id,bank_account_id,valor,estado,idempotency_key,created_by,origen_operacion,secuencia_beneficiario)
 VALUES(l.id,paid.beneficiary_id,paid.bank_account_id,v_delta,'pendiente',gen_random_uuid(),p_actor,o.origen_codigo,v_seq) RETURNING id INTO v_order;
 INSERT INTO public.payment_items(payment_order_id,operation_id,concepto,valor) VALUES(v_order,o.id,'ajuste_accesorios_alo',v_delta);
 UPDATE public.payment_orders SET concept='Diferencia por accesorios Aló · crédito '||o.external_id WHERE id=v_order;
 result:=jsonb_build_object('operation_id',o.id,'payment_order_id',v_order,'diferencia',v_delta,'pago_neto_corregido',v_net,'utilidad_corregida',v_utility,'estado','pendiente');
 INSERT INTO public.liquidation_adjustments(liquidation_id,operation_id,field_name,old_value,new_value,motivo,estado,created_by,approved_by,approved_at)
 VALUES(l.id,o.id,'alo_accesorios_rectificados',archive,result,'Corrección autorizada por Gerencia: incluir Monto Total con accesorios; pago original conservado y diferencia pendiente de giro.','aprobado',p_actor,p_actor,now());
 INSERT INTO public.audit_log(usuario,accion,tabla,registro_id,detalle) VALUES(p_actor,'alo_accesorios_rectificados','liquidation_operations',o.id,result);
 IF (select to_jsonb(p) from public.payment_orders p where id=paid.id) IS DISTINCT FROM to_jsonb(paid)
 OR (select jsonb_agg(to_jsonb(i) order by id) from public.payment_items i where payment_order_id=paid.id) IS DISTINCT FROM archive->'items' THEN RAISE EXCEPTION 'Pago original alterado'; END IF;
 UPDATE kora_private.rectificaciones_alo_accesorios SET after_data=result,completed_at=now() WHERE operation_id=o.id;
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION kora_private.rectificar_alo_accesorios(uuid,uuid,numeric,numeric,numeric) FROM public,anon,authenticated,service_role;

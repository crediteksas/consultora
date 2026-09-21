BEGIN;
-- Autorización Oscar 2026-09-21: rectificar utilidad e ingreso esperado PayJoy.
-- No cambia PAGAMOS, giros, bonos, aprobaciones, pagos ni abonos reales.
CREATE TABLE kora_private.rectificaciones_payjoy_neto (
 liquidation_id uuid PRIMARY KEY REFERENCES public.liquidations(id),
 before_data jsonb NOT NULL, after_data jsonb,
 permit_transaction bigint, completed_at timestamptz
);
ALTER TABLE kora_private.rectificaciones_payjoy_neto ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON kora_private.rectificaciones_payjoy_neto FROM PUBLIC,anon,authenticated,service_role;

-- La excepción de rectificación existe solo dentro de esta transacción; se restaura
-- íntegramente la protección original antes del COMMIT.
CREATE TEMP TABLE payjoy_original_guards ON COMMIT DROP AS
 SELECT p.oid,pg_get_functiondef(p.oid) definition FROM pg_proc p
 WHERE p.oid IN ('public.aliados_impedir_cambio_aprobado()'::regprocedure,
 'public.aliados_impedir_cambio_operacion_aprobada()'::regprocedure);
DO $patch$
DECLARE r record; d text; allowance text;
BEGIN
 FOR r IN SELECT * FROM payjoy_original_guards LOOP
  IF r.oid='public.aliados_impedir_cambio_aprobado()'::regprocedure THEN
   allowance:=$s$
 if TG_OP='UPDATE' and old.plataforma='payjoy' and exists(select 1 from kora_private.rectificaciones_payjoy_neto r where r.liquidation_id=old.id and r.permit_transaction=txid_current() and r.completed_at is null)
 and (to_jsonb(old)-array['total_operaciones','total_utilidad_creditek','total_utilidad_tiendas','updated_at'])=(to_jsonb(new)-array['total_operaciones','total_utilidad_creditek','total_utilidad_tiendas','updated_at']) then return new; end if;
 $s$;
  ELSE
   allowance:=$s$
 if TG_OP='UPDATE' and old.plataforma='payjoy' and exists(select 1 from kora_private.rectificaciones_payjoy_neto r where r.liquidation_id=old.liquidation_id and r.permit_transaction=txid_current() and r.completed_at is null)
 and (to_jsonb(old)-array['valor_comercial','utilidad_creditek','utilidad_creditek_tienda','policy_snapshot'])=(to_jsonb(new)-array['valor_comercial','utilidad_creditek','utilidad_creditek_tienda','policy_snapshot']) then return new; end if;
 $s$;
  END IF;
  IF position(E'begin\n' in r.definition)=0 THEN RAISE EXCEPTION 'Guard changed'; END IF;
  d:=replace(r.definition,E'begin\n',E'begin\n'||allowance); EXECUTE d;
 END LOOP;
END $patch$;

DO $repair$
DECLARE l record; o record; archive jsonb; result jsonb; net numeric; profit numeric; r record; actor uuid;
BEGIN
 SELECT p.id INTO STRICT actor FROM public.perfiles p JOIN auth.users u ON u.id=p.id
 WHERE u.email='comercial@crediteksas.com' AND p.nombre='Oscar Pacheco';
 -- No expected PayJoy has been confirmed yet. Abort rather than overwrite a
 -- concurrent manual confirmation; deposits and allocations are never modified.
 IF EXISTS(SELECT 1 FROM public.cobros_expected WHERE plataforma='payjoy') THEN
  RAISE EXCEPTION 'PayJoy expected confirmations require reconciliation before migration'; END IF;
 FOR l IN SELECT * FROM public.liquidations WHERE plataforma='payjoy' AND estado<>'anulada' ORDER BY id FOR UPDATE LOOP
  SELECT jsonb_build_object('liquidation',to_jsonb(l),
   'operations',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.liquidation_operations x WHERE liquidation_id=l.id),
   'calculations',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.liquidation_calculations x WHERE liquidation_id=l.id),
   'orders',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.payment_orders x WHERE liquidation_id=l.id),
   'movements',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.treasury_movements x WHERE liquidation_id=l.id)) INTO archive;
  INSERT INTO kora_private.rectificaciones_payjoy_neto(liquidation_id,before_data,permit_transaction) VALUES(l.id,archive,txid_current());
  FOR o IN SELECT * FROM public.liquidation_operations WHERE liquidation_id=l.id AND reconocida FOR UPDATE LOOP
   IF coalesce(o.monto_credito,o.monto_base) IS NULL OR o.inicial IS NULL OR o.bonos_aplicados IS NULL OR coalesce(o.pago_neto_beneficiario,o.pago_neto_tienda) IS NULL
    OR (SELECT count(*) FROM public.liquidation_calculations WHERE operation_id=o.id)<>1 THEN RAISE EXCEPTION 'Incomplete PayJoy calculation %',o.id; END IF;
   net:=coalesce(o.monto_credito,o.monto_base)-o.inicial;
   profit:=round(net-coalesce(o.pago_neto_beneficiario,o.pago_neto_tienda)-o.bonos_aplicados,2);
   IF net<0 THEN RAISE EXCEPTION 'Invalid PayJoy initial %',o.id; END IF;
   result:=jsonb_build_object('rectificacion','payjoy_neto_20260921','importe_archivo',coalesce(o.monto_credito,o.monto_base),'inicial_en_tienda',o.inicial,'neto_esperado_payjoy',net,'utilidad_anterior',o.utilidad_creditek,'utilidad_corregida',profit,'giros_conservados',true);
   UPDATE public.liquidation_operations SET valor_comercial=coalesce(o.monto_credito,o.monto_base),utilidad_creditek=profit,
    utilidad_creditek_tienda=CASE WHEN o.tipo_establecimiento='propia' THEN profit ELSE o.utilidad_creditek_tienda END,
    policy_snapshot=coalesce(policy_snapshot,'{}'::jsonb)||jsonb_build_object('payjoy_neto',result) WHERE id=o.id;
   UPDATE public.liquidation_calculations SET utilidad_creditek=profit,
    explanation=coalesce(explanation,'{}'::jsonb)||result||jsonb_build_object('valor_comercial',coalesce(o.monto_credito,o.monto_base)),
    policy_snapshot=coalesce(policy_snapshot,'{}'::jsonb)||jsonb_build_object('payjoy_neto',result) WHERE operation_id=o.id;
  END LOOP;
  UPDATE public.liquidations SET
   total_operaciones=(SELECT sum(valor_comercial) FROM public.liquidation_operations WHERE liquidation_id=l.id AND reconocida),
   total_utilidad_creditek=(SELECT sum(utilidad_creditek) FROM public.liquidation_operations WHERE liquidation_id=l.id AND reconocida),
   total_utilidad_tiendas=(SELECT coalesce(sum(utilidad_creditek_tienda),0) FROM public.liquidation_operations WHERE liquidation_id=l.id AND reconocida AND tipo_establecimiento='propia'),updated_at=now() WHERE id=l.id;
  SELECT jsonb_build_object('utilidad_anterior',l.total_utilidad_creditek,'utilidad_corregida',total_utilidad_creditek,
   'neto_esperado_payjoy',(SELECT sum(coalesce(monto_credito,monto_base)-inicial) FROM public.liquidation_operations WHERE liquidation_id=l.id AND reconocida),
   'pagos_y_abonos_conservados',true) INTO result FROM public.liquidations WHERE id=l.id;
  IF archive->'orders' IS DISTINCT FROM coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.payment_orders x WHERE liquidation_id=l.id),'null'::jsonb)
   OR archive->'movements' IS DISTINCT FROM coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.treasury_movements x WHERE liquidation_id=l.id),'null'::jsonb)
  THEN RAISE EXCEPTION 'Payments must remain unchanged'; END IF;
  INSERT INTO public.liquidation_adjustments(liquidation_id,field_name,old_value,new_value,motivo,estado,created_by,approved_by,approved_at)
   VALUES(l.id,'payjoy_neto_rectificado',jsonb_build_object('utilidad',l.total_utilidad_creditek),result,'Autorizado por Oscar 2026-09-21: excluir inicial en tienda del ingreso PayJoy, conservar giros y abonos reales.','aprobado',actor,actor,now());
  INSERT INTO public.audit_log(usuario,accion,tabla,registro_id,detalle) VALUES('mantenimiento_autorizado_oscar','payjoy_neto_rectificado','liquidations',l.id::text,result);
  UPDATE kora_private.rectificaciones_payjoy_neto SET after_data=result,permit_transaction=NULL,completed_at=now() WHERE liquidation_id=l.id;
 END LOOP;
 FOR r IN SELECT * FROM payjoy_original_guards LOOP EXECUTE r.definition; END LOOP;
END $repair$;

-- Correct future calculations, retaining percentage and giro basis unchanged.
DO $engine$
DECLARE d text; old_formula text;
BEGIN
 SELECT pg_get_functiondef('liquidaciones_api_private.calcular_liquidacion_sin_datos_pago(uuid)'::regprocedure) INTO d;
 old_formula:=$s$v_util:=round(case when o.plataforma='alo' or (o.plataforma='payjoy' and v.created_at >= timestamptz '2026-09-10 00:00:00-05') then coalesce(o.monto_credito,o.monto_base)-v_pago-v_bonus else v_base-v_pagamos-v_bonus end,2);$s$;
 IF position(old_formula in d)=0 THEN RAISE EXCEPTION 'PayJoy engine changed'; END IF;
 d:=replace(d,old_formula,'v_util:=round(case when o.plataforma=''payjoy'' then coalesce(o.monto_credito,o.monto_base)-o.inicial-v_pago-v_bonus when o.plataforma=''alo'' then coalesce(o.monto_credito,o.monto_base)-v_pago-v_bonus else v_base-v_pagamos-v_bonus end,2);');
 d:=replace(d,'v_comercial:=coalesce(o.monto_credito,o.monto_base)+o.inicial;','v_comercial:=coalesce(o.monto_credito,o.monto_base)+case when o.plataforma=''payjoy'' then 0 else o.inicial end;');
 EXECUTE d;
 SELECT pg_get_functiondef('cobros_private.resumen()'::regprocedure) INTO d;
 IF position('sum(o.monto_credito)' in d)=0 THEN RAISE EXCEPTION 'Cobros source changed'; END IF;
 d:=replace(d,'sum(o.monto_credito)','case when count(*) filter(where o.plataforma=''payjoy'' and (coalesce(o.monto_credito,o.monto_base) is null or o.inicial is null))>0 then null else sum(case when o.plataforma=''payjoy'' then coalesce(o.monto_credito,o.monto_base)-o.inicial else o.monto_credito end) end');
 EXECUTE d;
END $engine$;
COMMIT;

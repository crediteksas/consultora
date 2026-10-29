BEGIN;
SET LOCAL lock_timeout='5s';
DO $test$
DECLARE c public.banco_creditek_cuentas%ROWTYPE; actor uuid; k uuid:=gen_random_uuid(); r jsonb; r2 jsonb; rejected boolean; n bigint;
BEGIN
 SELECT * INTO STRICT c FROM public.banco_creditek_cuentas WHERE activa IS TRUE ORDER BY id LIMIT 1 FOR UPDATE;
 SELECT id INTO STRICT actor FROM public.perfiles WHERE rol='gerencia' ORDER BY id LIMIT 1;
 SELECT count(*) INTO n FROM public.banco_creditek_movimientos WHERE cuenta_id=c.id;
 r:=kora_private.conciliar_banco(c.id,c.saldo_actual,123.45,actor,k,'PRUEBA TRANSACCIONAL CON ROLLBACK');
 IF (r->>'saldo_actual')::numeric<>123.45 OR (r->>'ya_aplicado')::boolean THEN RAISE EXCEPTION 'FAIL balance'; END IF;
 r2:=kora_private.conciliar_banco(c.id,c.saldo_actual,123.45,actor,k,'PRUEBA TRANSACCIONAL CON ROLLBACK');
 IF r2->>'movimiento_id'<>r->>'movimiento_id' OR NOT (r2->>'ya_aplicado')::boolean THEN RAISE EXCEPTION 'FAIL idempotency'; END IF;
 IF (SELECT count(*) FROM public.banco_creditek_movimientos WHERE cuenta_id=c.id)<>n+1 THEN RAISE EXCEPTION 'FAIL duplicate'; END IF;
 rejected:=false;
 BEGIN PERFORM kora_private.conciliar_banco(c.id,c.saldo_actual,200,actor,k,'PRUEBA TRANSACCIONAL CON ROLLBACK');
 EXCEPTION WHEN raise_exception THEN rejected:=SQLERRM='Clave de conciliacion usada con otros datos'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL key reuse'; END IF;
 rejected:=false;
 BEGIN PERFORM kora_private.conciliar_banco(c.id,c.saldo_actual,200,actor,gen_random_uuid(),'PRUEBA TRANSACCIONAL CON ROLLBACK');
 EXCEPTION WHEN raise_exception THEN rejected:=SQLERRM='Cuenta inactiva o saldo cambiado; volver a verificar'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL stale balance'; END IF;
 rejected:=false;
 BEGIN PERFORM kora_private.conciliar_banco(c.id,123.45,-1,actor,gen_random_uuid(),'PRUEBA TRANSACCIONAL CON ROLLBACK');
 EXCEPTION WHEN raise_exception THEN rejected:=SQLERRM='Parametros de conciliacion invalidos'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL negative'; END IF;
 rejected:=false;
 BEGIN PERFORM kora_private.conciliar_banco(c.id,123.45,200,gen_random_uuid(),gen_random_uuid(),'PRUEBA TRANSACCIONAL CON ROLLBACK');
 EXCEPTION WHEN raise_exception THEN rejected:=SQLERRM='Se requiere autorizacion de gerencia'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL actor'; END IF;
 IF has_function_privilege('anon','kora_private.conciliar_banco(uuid,numeric,numeric,uuid,uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated','kora_private.conciliar_banco(uuid,numeric,numeric,uuid,uuid,text)','EXECUTE')
 OR has_function_privilege('service_role','kora_private.conciliar_banco(uuid,numeric,numeric,uuid,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'FAIL privileges'; END IF;
END $test$;
SELECT 'PASS: balance, idempotencia, unicidad, clave reutilizada, saldo cambiado, negativo, actor, privilegios; todo revertido al terminar' AS resultado;
ROLLBACK;

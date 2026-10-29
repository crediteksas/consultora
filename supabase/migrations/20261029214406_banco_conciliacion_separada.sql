BEGIN;
SET LOCAL lock_timeout = '5s';
-- Conciliation is a separate balance correction, never a payment or income.
-- Preserve every existing constraint branch and all historical movements.
DO $ddl$
DECLARE v_expression text; v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['banco_creditek_movimientos_tipo_check','banco_creditek_movimientos_check']
  LOOP
    SELECT pg_get_expr(conbin,conrelid) INTO STRICT v_expression
    FROM pg_constraint WHERE conrelid='public.banco_creditek_movimientos'::regclass AND conname=v_name;
    EXECUTE format('ALTER TABLE public.banco_creditek_movimientos DROP CONSTRAINT %I',v_name);
    EXECUTE format('ALTER TABLE public.banco_creditek_movimientos ADD CONSTRAINT %I CHECK ((%s) OR (tipo = ''ajuste_conciliacion'' AND solicitud_id IS NULL AND fuente_tabla = ''conciliacion_banco'' AND fuente_id IS NOT NULL AND registrado_por IS NOT NULL AND referencia IS NOT NULL AND length(trim(referencia)) >= 20 AND monto > 0 AND monto = abs(saldo_despues - saldo_antes)))',v_name,v_expression);
  END LOOP;
END $ddl$;

-- Administrative execution only: no grants to application or service roles.
CREATE OR REPLACE FUNCTION kora_private.conciliar_banco(
  p_cuenta uuid, p_saldo_esperado numeric, p_saldo_real numeric,
  p_actor uuid, p_clave uuid, p_motivo text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE v_cuenta public.banco_creditek_cuentas%ROWTYPE;
        v_previo public.banco_creditek_movimientos%ROWTYPE;
        v_id uuid;
BEGIN
  IF p_cuenta IS NULL OR p_actor IS NULL OR p_clave IS NULL
     OR p_saldo_esperado IS NULL OR p_saldo_real IS NULL
     OR p_saldo_real::text IN ('NaN','Infinity','-Infinity')
     OR p_saldo_esperado::text IN ('NaN','Infinity','-Infinity')
     OR p_saldo_real < 0 OR p_saldo_real <> round(p_saldo_real,2)
     OR p_motivo IS NULL OR length(trim(p_motivo)) < 20 THEN
    RAISE EXCEPTION 'Parametros de conciliacion invalidos';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.perfiles WHERE id=p_actor AND rol='gerencia') THEN
    RAISE EXCEPTION 'Se requiere autorizacion de gerencia';
  END IF;
  SELECT * INTO STRICT v_cuenta FROM public.banco_creditek_cuentas WHERE id=p_cuenta FOR UPDATE;
  SELECT * INTO v_previo FROM public.banco_creditek_movimientos
    WHERE fuente_tabla='conciliacion_banco' AND fuente_id=p_clave;
  IF FOUND THEN
    IF v_previo.cuenta_id IS DISTINCT FROM p_cuenta OR v_previo.saldo_despues IS DISTINCT FROM p_saldo_real
       OR v_previo.saldo_antes IS DISTINCT FROM p_saldo_esperado
       OR v_previo.registrado_por IS DISTINCT FROM p_actor OR v_previo.referencia IS DISTINCT FROM p_motivo THEN
      RAISE EXCEPTION 'Clave de conciliacion usada con otros datos';
    END IF;
    RETURN jsonb_build_object('ya_aplicado',true,'movimiento_id',v_previo.id,'saldo_actual',v_cuenta.saldo_actual);
  END IF;
  IF NOT v_cuenta.activa OR v_cuenta.saldo_actual IS DISTINCT FROM p_saldo_esperado THEN
    RAISE EXCEPTION 'Cuenta inactiva o saldo cambiado; volver a verificar';
  END IF;
  IF p_saldo_real = p_saldo_esperado THEN RAISE EXCEPTION 'No existe diferencia que ajustar'; END IF;
  INSERT INTO public.banco_creditek_movimientos(cuenta_id,tipo,monto,saldo_antes,saldo_despues,
    fecha,referencia,registrado_por,fuente_tabla,fuente_id,ocurrido_at)
  VALUES(p_cuenta,'ajuste_conciliacion',abs(p_saldo_real-p_saldo_esperado),p_saldo_esperado,p_saldo_real,
    (now() AT TIME ZONE 'America/Bogota')::date,p_motivo,p_actor,'conciliacion_banco',p_clave,now())
  RETURNING id INTO v_id;
  UPDATE public.banco_creditek_cuentas SET saldo_actual=p_saldo_real WHERE id=p_cuenta;
  RETURN jsonb_build_object('ya_aplicado',false,'movimiento_id',v_id,'saldo_actual',p_saldo_real,
    'diferencia',p_saldo_real-p_saldo_esperado);
END $fn$;
REVOKE ALL ON FUNCTION kora_private.conciliar_banco(uuid,numeric,numeric,uuid,uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;

COMMIT;

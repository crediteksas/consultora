-- Fail closed: an authenticated session without an active profile must not apply abonos.
BEGIN;
DO $fix$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.verificar_abono_y_aplicar_v2(uuid,uuid,boolean)'::regprocedure) INTO definition;
 IF position('if v_rol not in (''gerencia'', ''auditoria'') then' IN definition)>0 THEN
  EXECUTE replace(definition,
   'if v_rol not in (''gerencia'', ''auditoria'') then',
   'if auth.uid() is null or v_rol is null or v_rol not in (''gerencia'', ''auditoria'') then');
 ELSIF position('if auth.uid() is null or v_rol is null or v_rol not in (''gerencia'', ''auditoria'') then' IN definition)=0 THEN
  RAISE EXCEPTION 'Unexpected abono function: review before applying';
 END IF;
END $fix$;
REVOKE ALL ON FUNCTION public.verificar_abono_y_aplicar_v2(uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verificar_abono_y_aplicar_v2(uuid,uuid,boolean) TO authenticated;
COMMIT;

-- La aprobación del ajuste fue autorizada expresamente por el aprobador del lote.
DO $body$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('kora_private.rectificar_krediya_bonos_20260908(uuid)'::regprocedure) INTO definition;
 definition:=replace(definition,
 'liquidation_id,field_name,old_value,new_value,motivo,estado,approved_at)',
 'liquidation_id,field_name,old_value,new_value,motivo,estado,approved_at,created_by,approved_by)');
 definition:=replace(definition,'''aprobado'',now());','''aprobado'',now(),l.approved_by,l.approved_by);');
 EXECUTE definition;
END $body$;

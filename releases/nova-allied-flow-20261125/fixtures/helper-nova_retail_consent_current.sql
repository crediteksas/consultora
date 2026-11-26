CREATE OR REPLACE FUNCTION public.nova_retail_consent_current(p_source uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_customer uuid; v_active boolean;
BEGIN
 SELECT s.cliente_id INTO v_customer FROM public.kora_nova_sources s WHERE s.solicitud_id=p_source;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT c.autorizacion_datos IS TRUE INTO v_active FROM public.clientes c WHERE c.id=v_customer FOR SHARE;
 IF NOT FOUND OR v_active IS NOT TRUE THEN RETURN false; END IF;
 SELECT s.revoked_at IS NULL AND s.consent->'granted'='true'::jsonb AND s.consent->'revoked'='false'::jsonb
 INTO v_active FROM public.kora_nova_sources s WHERE s.solicitud_id=p_source AND s.cliente_id=v_customer FOR SHARE;
 RETURN coalesce(v_active,false);
END;
$function$

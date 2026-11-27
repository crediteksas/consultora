CREATE OR REPLACE FUNCTION public.kora_confirmacion_deuda_pre_request()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ select kora_private.exigir_confirmacion_deuda_api(); $function$

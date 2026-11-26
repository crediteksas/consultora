CREATE OR REPLACE FUNCTION public.nova_read_krediya_job(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select to_jsonb(j) from public.nova_platform_jobs j
 join public.nova_credit_applications a on a.id=j.application_id
 where j.id=p_id and j.platform='KREDIYA' and a.store_code='CK-02';
$function$

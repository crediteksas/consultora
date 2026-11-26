CREATE OR REPLACE FUNCTION public.nova_read_krediya_browser_job(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select to_jsonb(j) from public.nova_platform_jobs j
 join public.nova_credit_applications a on a.id=j.application_id
 join public.nova_registration_receipts r on r.application_id=j.application_id and r.source_application_id=j.source_application_id and r.payload_hash=j.payload_hash
 where j.id=p_id and j.platform='KREDIYA' and a.store_code in ('CK-01','CK-02','CK-03','CK-04','CK-05','CK-06','CK-07','CK-08','CK-09','distritoys','club-seven','ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C');
$function$

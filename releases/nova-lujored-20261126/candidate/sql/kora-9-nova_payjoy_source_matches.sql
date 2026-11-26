CREATE OR REPLACE FUNCTION public.nova_payjoy_source_matches(p_source uuid, p_application uuid, p_payload_hash text, p_document text, p_phone text, p_consent jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
select exists (
 select 1 from (SELECT s.solicitud_id AS source_application_id,b.application_id,b.receipt_hash AS payload_hash,
 coalesce(renewal.consent,s.consent->'platform_queries') AS consent,s.registration->>'p_cedula' AS document,s.registration->>'p_celular' AS phone,
 (s.revoked_at IS NULL AND c.autorizacion_datos IS TRUE AND o.activo IS TRUE
 AND l.activo IS TRUE AND l.revoked_at IS NULL AND v.activo IS TRUE
 AND v.origen_codigo=s.registration->>'p_origen_codigo' AND l.origen_codigo=s.registration->>'p_origen_codigo' AND q.origen_codigo=s.registration->>'p_origen_codigo' AND v.origen_codigo in ('CK-01','CK-02','CK-03','CK-04','CK-05','CK-06','CK-07','CK-08','CK-09','distritoys','club-seven','ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C','ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B') AND l.origen_codigo in ('CK-01','CK-02','CK-03','CK-04','CK-05','CK-06','CK-07','CK-08','CK-09','distritoys','club-seven','ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C','ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B')
 AND (l.captador_id IS NULL OR l.captador_id=q.captador_id)
 AND s.consent->'granted'='true'::jsonb AND s.consent->'revoked'='false'::jsonb
 AND s.consent->'platform_queries'->'revoked' IS DISTINCT FROM 'true'::jsonb
 AND NOT EXISTS (SELECT 1 FROM public.nova_retail_cases finished
 WHERE finished.source_id=s.solicitud_id AND (finished.delivered_at IS NOT NULL OR finished.state='rejected'))) AS active
 FROM public.kora_nova_sources s JOIN public.clientes c ON c.id=s.cliente_id
 JOIN public.solicitudes q ON q.id=s.solicitud_id AND q.origen_codigo in ('CK-01','CK-02','CK-03','CK-04','CK-05','CK-06','CK-07','CK-08','CK-09','distritoys','club-seven','ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C','ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B')
 JOIN public.origenes o ON o.codigo=q.origen_codigo
 JOIN public.enlaces_registro l ON l.id=q.enlace_registro_id
 JOIN public.captadores v ON v.id=q.captador_id
 JOIN public.kora_nova_outbox b ON b.solicitud_id=s.solicitud_id AND b.state='delivered'
 LEFT JOIN LATERAL (SELECT id,consent FROM public.kora_nova_platform_renewals
 WHERE solicitud_id=s.solicitud_id ORDER BY created_at DESC,id DESC LIMIT 1) renewal ON true
 WHERE s.solicitud_id=p_source AND s.registration->>'p_origen_codigo' in ('CK-01','CK-02','CK-03','CK-04','CK-05','CK-06','CK-07','CK-08','CK-09','distritoys','club-seven','ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C','ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B') LIMIT 1) as s
 where s.active is true and s.application_id=p_application and s.payload_hash=p_payload_hash
 and s.document=p_document and s.phone=p_phone
 and s.consent=p_consent and (s.consent->>'expires_at')::timestamptz>now()
);
$function$

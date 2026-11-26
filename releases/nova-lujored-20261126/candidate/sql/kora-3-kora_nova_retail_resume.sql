CREATE OR REPLACE FUNCTION public.kora_nova_retail_resume(p_otp uuid, p_enlace uuid, p_cedula text, p_celular text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s public.kora_nova_sources; v_origin text; hashes jsonb; v_count integer;
begin
 perform 1 from public.otp_codigos o where o.id=p_otp and o.enlace_registro_id=p_enlace and o.cedula=p_cedula and o.celular=p_celular and o.verificado and o.envio_aceptado_at is not null and o.envio_fallido_at is null and o.created_at>now()-interval '30 minutes';
 if not found then raise exception 'OTP_REQUIRED';end if;
 select origen_codigo into v_origin from public.enlaces_registro where id=p_enlace and activo and revoked_at is null;
 if v_origin !~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C|ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B)$' or v_origin is null then raise exception 'OUTSIDE_PILOT';end if;
 select src.* into s from public.kora_nova_sources src join public.clientes c on c.id=src.cliente_id left join public.nova_retail_cases rc on rc.source_id=src.solicitud_id where c.cedula=p_cedula and c.celular=p_celular and src.registration->>'p_origen_codigo'=v_origin and src.revoked_at is null and rc.delivered_at is null order by src.submitted_at desc limit 1;
 if not found then return jsonb_build_object('found',false);end if;
 select jsonb_object_agg(tipo,sha256),count(*) into hashes,v_count from public.documentos_solicitud where solicitud_id=s.solicitud_id;
 
 return jsonb_build_object('found',true,'incomplete',v_count<>3,'sourceId',s.solicitud_id,'clientId',s.cliente_id,'hashes',coalesce(hashes,'{}'::jsonb),'sourceOtp',s.otp_id,'name',s.registration->>'p_nombre_completo','savedTypes',(select coalesce(jsonb_agg(tipo),'[]'::jsonb) from public.documentos_solicitud where solicitud_id=s.solicitud_id));
end $function$

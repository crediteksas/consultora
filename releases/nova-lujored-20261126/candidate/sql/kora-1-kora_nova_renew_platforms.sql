CREATE OR REPLACE FUNCTION public.kora_nova_renew_platforms(p_otp_id uuid, p_cedula text, p_celular text, p_enlace_id uuid, p_commit jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare otp public.otp_codigos; q public.solicitudes; c public.clientes; s public.kora_nova_sources;
 e public.kora_nova_platform_renewals; fp text; auth jsonb;
begin
 if (p_cedula ~ '^[0-9]{6,12}$' and p_celular ~ '^3[0-9]{9}$') is not true then raise exception 'UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended('kora-nova-otp:'||p_otp_id::text,0));
 select * into otp from public.otp_codigos where id=p_otp_id for update;
 if not found or (otp.verificado=true and otp.envio_aceptado_at is not null and otp.envio_fallido_at is null
  and otp.cedula=p_cedula and otp.celular=p_celular and otp.enlace_registro_id=p_enlace_id
  and otp.created_at>now()-interval '30 minutes' and otp.created_at<=now()) is not true then raise exception 'UNAVAILABLE';end if;
 select * into c from public.clientes where cedula=p_cedula and celular=p_celular and autorizacion_datos=true for share;
 if not found then raise exception 'UNAVAILABLE';end if;
 select * into q from public.solicitudes q1 where q1.cliente_id=c.id and q1.enlace_registro_id=p_enlace_id and q1.origen_codigo ~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C|ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B)$' and not exists(select 1 from public.nova_retail_cases rc where rc.source_id=q1.id and (rc.delivered_at is not null or rc.state='rejected')) order by q1.created_at desc limit 1 for update;
 if not found then raise exception 'UNAVAILABLE';end if;
 perform 1 from public.enlaces_registro l join public.captadores v on v.id=q.captador_id
 join public.origenes o on o.codigo=q.origen_codigo
 where l.id=p_enlace_id and l.activo=true and l.revoked_at is null and l.origen_codigo=q.origen_codigo
 and (l.captador_id is null or l.captador_id=q.captador_id) and v.activo=true and v.origen_codigo=q.origen_codigo and o.activo=true;
 if not found then raise exception 'UNAVAILABLE';end if;
 select * into s from public.kora_nova_sources where solicitud_id=q.id for share;
 if not found or s.revoked_at is not null or (s.consent->'granted'='true'::jsonb and s.consent->'revoked'='false'::jsonb
  and s.registration->>'p_cedula'=p_cedula and s.registration->>'p_celular'=p_celular) is not true
  or s.consent->'platform_queries'->'revoked'='true'::jsonb then raise exception 'UNAVAILABLE';end if;
 perform 1 from public.kora_nova_outbox where solicitud_id=q.id and state='delivered';
 if not found then raise exception 'RECEIPT_REQUIRED';end if;
 fp:=encode(sha256(convert_to(jsonb_build_object('source',to_jsonb(s)-'next_check_at','request',to_jsonb(q),'customer',to_jsonb(c))::text,'UTF8')),'hex');
 if p_commit is not null and (p_commit->'granted'='true'::jsonb and p_commit->>'text_version' in ('nova-platform-query-v1','nova-platform-query-v2')
   and p_commit->>'fingerprint'=fp and octet_length(p_commit::text)<1024) is not true then raise exception 'CONSENT_REQUIRED';end if;
 select * into e from public.kora_nova_platform_renewals where otp_id=p_otp_id;
 if found then
  if e.solicitud_id<>q.id or e.fingerprint<>fp then raise exception 'RENEWAL_CONFLICT';end if;
  return jsonb_build_object('ok',true,'renewed',true,'renewal_id',e.id,'source_application_id',q.id,'expires_at',e.consent->>'expires_at');
 end if;
 if otp.registro_consumido_at is not null or otp.expira_at is null or otp.expira_at<=now() then raise exception 'OTP_EXPIRED';end if;
 if p_commit is null then return jsonb_build_object('ok',true,'renewed',false,'fingerprint',fp,'name',c.nombre_completo,'source_application_id',q.id);end if;
 -- One currently valid renewal per source; do not extend it on another OTP.
 if exists(select 1 from public.kora_nova_platform_renewals where solicitud_id=q.id and (consent->>'expires_at')::timestamptz>now()) then raise exception 'RENEWAL_ALREADY_CURRENT';end if;
 auth:=jsonb_build_object('granted',true,'revoked',false,'text_version',p_commit->>'text_version',
  'platforms',jsonb_build_array('PAYJOY','KREDIYA','ALO'),'accepted_at',now(),'expires_at',now()+case p_commit->>'text_version' when 'nova-platform-query-v2' then interval '360 hours' else interval '24 hours' end);
 update public.otp_codigos set registro_consumido_at=now() where id=p_otp_id;
 insert into public.kora_nova_platform_renewals(solicitud_id,otp_id,fingerprint,consent) values(q.id,p_otp_id,fp,auth) returning * into e;
 return jsonb_build_object('ok',true,'renewed',true,'renewal_id',e.id,'source_application_id',q.id,'expires_at',auth->>'expires_at');
end;$function$

CREATE OR REPLACE FUNCTION public.kora_nova_recover(p_otp_id uuid, p_cedula text, p_celular text, p_enlace_id uuid, p_commit jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare otp public.otp_codigos; q public.solicitudes; c public.clientes;
 src public.kora_nova_sources; refs jsonb; docs jsonb; fingerprint text; r jsonb; consent jsonb;
 input_hash text; family uuid; outcome jsonb;
begin
 if (p_cedula ~ '^[0-9]{6,12}$' and p_celular ~ '^3[0-9]{9}$') is not true then raise exception 'UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended('kora-nova-otp:'||p_otp_id::text,0));
 select * into otp from public.otp_codigos where id=p_otp_id for update;
 if not found or (otp.verificado=true and otp.envio_aceptado_at is not null and otp.envio_fallido_at is null
   and otp.cedula=p_cedula and otp.celular=p_celular and otp.enlace_registro_id=p_enlace_id
   and otp.created_at>now()-interval '30 minutes' and otp.created_at<=now()) is not true then raise exception 'UNAVAILABLE';end if;
 -- A not-found result is available only after verified, bound OTP and active link checks.
 perform 1 from public.enlaces_registro l join public.origenes o on o.codigo=l.origen_codigo
 where l.id=p_enlace_id and l.activo=true and l.revoked_at is null and o.codigo ~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C|ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B)$'
 and o.activo=true and o.tipo in ('propia','aliado')
 and exists(select 1 from public.captadores v where v.activo=true and v.origen_codigo=o.codigo
 and (l.captador_id is null or v.id=l.captador_id));
 if not found then raise exception 'UNAVAILABLE';end if;
 if not exists(select 1 from public.solicitudes existing join public.clientes customer on customer.id=existing.cliente_id
   where customer.cedula=p_cedula and existing.enlace_registro_id=p_enlace_id and existing.origen_codigo ~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C|ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B)$') then
   if p_commit is not null then raise exception 'UNAVAILABLE';end if;
   return jsonb_build_object('ok',true,'not_found',true);
 end if;
 select * into c from public.clientes where cedula=p_cedula and celular=p_celular and autorizacion_datos=true for share;
 if not found then raise exception 'UNAVAILABLE';end if;
 -- References in legacy schema belong to a customer, not a request. Never guess
 -- which request they belonged to when the customer has more than one.
 if (select count(*) from public.solicitudes where cliente_id=c.id)<>1 then raise exception 'AMBIGUOUS_REGISTRATION';end if;
 select * into q from public.solicitudes where cliente_id=c.id and enlace_registro_id=p_enlace_id and origen_codigo ~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C|ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B)$' for update;
 if not found then raise exception 'UNAVAILABLE';end if;
 perform 1 from public.enlaces_registro l join public.captadores v on v.id=q.captador_id
 join public.origenes o on o.codigo=q.origen_codigo
 where l.id=p_enlace_id and l.activo=true and l.revoked_at is null and l.origen_codigo=q.origen_codigo
 and (l.captador_id is null or l.captador_id=q.captador_id) and v.activo=true and v.origen_codigo=q.origen_codigo
 and o.activo=true and o.tipo in ('propia','aliado');
 if not found then raise exception 'UNAVAILABLE';end if;
 select * into src from public.kora_nova_sources where solicitud_id=q.id;
 if found then
   if src.revoked_at is not null then raise exception 'UNAVAILABLE';end if;
   if src.otp_id<>p_otp_id then raise exception 'ALREADY_REGISTERED';end if;
   input_hash:=encode(sha256(convert_to(p_commit::text,'UTF8')),'hex');
   if p_commit is not null and input_hash<>src.input_hash then raise exception 'RECOVERY_CONFLICT';end if;
   return jsonb_build_object('ok',true,'recovered',true,'solicitud_id',q.id,'receipt',public.kora_nova_finalize(q.id));
 end if;
 if otp.registro_consumido_at is not null or otp.expira_at is null or otp.expira_at<=now() then raise exception 'OTP_EXPIRED';end if;
 perform 1 from public.referencias where cliente_id=c.id for share;
 select jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'telefono',telefono,'parentesco',parentesco) order by id)
 into refs from public.referencias where cliente_id=c.id;
 if jsonb_array_length(refs) is distinct from 2 or
 (select count(distinct x->>'telefono') from jsonb_array_elements(refs) x)<>2 or
 exists(select 1 from jsonb_array_elements(refs) x where
  (x->>'telefono' ~ '^3[0-9]{9}$' and x->>'telefono'<>p_celular and length(btrim(x->>'nombre')) between 2 and 120) is not true)
 then raise exception 'REFERENCES_UNAVAILABLE';end if;
 perform 1 from public.documentos_solicitud where solicitud_id=q.id for share;
 select jsonb_agg(jsonb_build_object('type',tipo,'path',storage_path,'sha256',sha256) order by tipo)
 into docs from public.documentos_solicitud where solicitud_id=q.id and cliente_id=c.id;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('customer',to_jsonb(c),'request',to_jsonb(q),'refs',refs,'docs',docs)::text,'UTF8')),'hex');
 if p_commit is null then
   return jsonb_build_object('ok',true,'recovered',false,'solicitud_id',q.id,'name',c.nombre_completo,'city',c.ciudad,
    'fingerprint',fingerprint,'references',(select jsonb_agg(jsonb_build_object('id',x->>'id','name',x->>'nombre','phone_suffix',right(x->>'telefono',4))) from jsonb_array_elements(refs) x));
 end if;
 if jsonb_typeof(p_commit) is distinct from 'object' or octet_length(p_commit::text)>2048 then raise exception 'CONSENT_REQUIRED';end if;
 if (p_commit->>'fingerprint'=fingerprint and p_commit->'granted'='true'::jsonb
   and p_commit->'references_confirmed'='true'::jsonb and p_commit->>'policy_version'='2.0'
   and p_commit->>'text_version'='nova-pilot-20260915-v1'
   and p_commit->>'policy_hash'='e482ba5840a84938043c159e6787f07fb8748bf2e784b4e56946991d5de4af11'
   and coalesce(p_commit->>'platform_text_version','nova-platform-query-v1') in ('nova-platform-query-v1','nova-platform-query-v2')
   and jsonb_typeof(p_commit->'whatsapp')='boolean' and jsonb_typeof(p_commit->'platform_queries')='boolean') is not true
 then raise exception 'CONSENT_REQUIRED';end if;
 family:=(p_commit->>'family_id')::uuid;
 if family is null or not exists(select 1 from jsonb_array_elements(refs) x where (x->>'id')::uuid=family) then raise exception 'REFERENCES_REQUIRED';end if;
 select jsonb_agg(jsonb_build_object('type',case when (x->>'id')::uuid=family then 'family' else 'personal' end,
 'nombre',x->>'nombre','telefono',x->>'telefono','parentesco',x->>'parentesco','contact_authorized',true) order by x->>'id') into refs from jsonb_array_elements(refs) x;
 r:=jsonb_build_object('p_cedula',c.cedula,'p_nombre_completo',c.nombre_completo,'p_celular',c.celular,'p_email',c.email,
 'p_ciudad',c.ciudad,'p_direccion',c.direccion,'p_origen_codigo',q.origen_codigo,'p_captador_id',q.captador_id,
 'p_enlace_registro_id',q.enlace_registro_id,'p_otp_id',p_otp_id,'p_producto_interes',q.producto_interes,
 'p_financiera',q.financiera,'p_autorizacion_comercial',false,'p_autorizacion_version','2.0','p_referencias',refs);
 consent:=jsonb_build_object('granted',true,'revoked',false,'policy_version','2.0','text_version','nova-pilot-20260915-v1',
 'policy_hash',p_commit->>'policy_hash','accepted_at',now(),'channels',case when p_commit->'whatsapp'='true'::jsonb then '["whatsapp"]'::jsonb else '[]'::jsonb end);
 if p_commit->'platform_queries'='true'::jsonb then consent:=consent||jsonb_build_object('platform_queries',jsonb_build_object(
 'granted',true,'revoked',false,'text_version',coalesce(p_commit->>'platform_text_version','nova-platform-query-v1'),'platforms',jsonb_build_array('PAYJOY','KREDIYA','ALO'),
 'accepted_at',now(),'expires_at',now()+case coalesce(p_commit->>'platform_text_version','nova-platform-query-v1') when 'nova-platform-query-v2' then interval '360 hours' else interval '24 hours' end));end if;
 input_hash:=encode(sha256(convert_to(p_commit::text,'UTF8')),'hex');
 update public.otp_codigos set registro_consumido_at=now() where id=p_otp_id;
 insert into public.kora_nova_sources(solicitud_id,cliente_id,otp_id,input_hash,registration,consent) values(q.id,c.id,p_otp_id,input_hash,r,consent);
 outcome:=public.kora_nova_finalize(q.id);
 if outcome->'queued' is distinct from 'true'::jsonb then raise exception 'EVIDENCE_INCOMPLETE';end if;
 return jsonb_build_object('ok',true,'recovered',true,'solicitud_id',q.id,'receipt',outcome);
end;$function$

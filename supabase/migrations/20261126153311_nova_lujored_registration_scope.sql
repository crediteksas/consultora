SET LOCAL lock_timeout='5s';
SET LOCAL search_path=pg_catalog,public;
DO $guard$ BEGIN
IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='nova_retail_cases_store_code_check') IS DISTINCT FROM 'CHECK ((store_code ~ ''^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C)$''::text))' THEN RAISE EXCEPTION 'CONCURRENT_CONSTRAINT_CHANGE';END IF;
IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='nova_client_otp_policy_allowed_origins_check') IS DISTINCT FROM 'CHECK ((allowed_origins <@ ARRAY[''CK-01''::text, ''CK-02''::text, ''CK-03''::text, ''CK-04''::text, ''CK-05''::text, ''CK-06''::text, ''CK-07''::text, ''CK-08''::text, ''CK-09''::text, ''distritoys''::text, ''club-seven''::text, ''ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C''::text]))' THEN RAISE EXCEPTION 'CONCURRENT_CONSTRAINT_CHANGE';END IF;
IF NOT EXISTS(SELECT 1 FROM public.nova_client_otp_policy p WHERE id AND allowed_origins=ARRAY['CK-01','CK-02','CK-03','CK-04','CK-05','CK-06','CK-07','CK-08','CK-09','distritoys','club-seven','ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C']::text[] AND md5((to_jsonb(p)-'allowed_origins')::text)='e2369ac72aa3bcccf4e63622d216aa81') THEN RAISE EXCEPTION 'CONCURRENT_POLICY_CHANGE';END IF;
IF EXISTS(SELECT 1 FROM public.perfiles WHERE tienda_codigo='ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B') OR EXISTS(SELECT 1 FROM public.nova_allied_login_members WHERE store_code='ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B') THEN RAISE EXCEPTION 'UNEXPECTED_EXISTING_IDENTITY';END IF;
END $guard$;
ALTER TABLE public.nova_retail_cases DROP CONSTRAINT nova_retail_cases_store_code_check;
ALTER TABLE public.nova_retail_cases ADD CONSTRAINT nova_retail_cases_store_code_check CHECK(store_code ~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C|ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B)$');
ALTER TABLE public.nova_client_otp_policy DROP CONSTRAINT nova_client_otp_policy_allowed_origins_check;
ALTER TABLE public.nova_client_otp_policy ADD CONSTRAINT nova_client_otp_policy_allowed_origins_check CHECK(allowed_origins <@ ARRAY['CK-01','CK-02','CK-03','CK-04','CK-05','CK-06','CK-07','CK-08','CK-09','distritoys','club-seven','ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C','ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B']::text[]);
UPDATE public.nova_client_otp_policy SET allowed_origins=array_append(allowed_origins,'ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B') WHERE id AND NOT 'ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B'=ANY(allowed_origins);
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
end;$function$;

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
end;$function$;

CREATE OR REPLACE FUNCTION public.nova_retail_candidates()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(source_id),'[]'::jsonb) from (
 select s.solicitud_id source_id from public.kora_nova_sources s left join public.nova_retail_cases c on c.source_id=s.solicitud_id
 where s.registration->>'p_origen_codigo' ~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C|ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B)$' and s.revoked_at is null and c.delivered_at is null
 and (c.source_id is null or c.state in ('review','waiting','correct'))
 and coalesce(c.renewed_at,s.submitted_at)>now()-interval '45 days'
 order by c.last_checked_at asc nulls first,s.submitted_at desc limit 30
 ) q;
$function$;

CREATE OR REPLACE FUNCTION public.nova_retail_save(p_source uuid, p_fingerprint text, p_decision jsonb, p_summary jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s public.kora_nova_sources; r public.nova_retail_cases; v_state text:=p_decision->>'state'; v_rejected timestamptz; v_revision integer; v_until timestamptz; v_previous_state text; v_consent_active boolean;
begin
 if p_fingerprint !~ '^[a-f0-9]{64}$' or v_state not in ('authorized','rejected','review','waiting','correct') or octet_length(p_summary::text)>65536 then raise exception 'INVALID_DECISION';end if;
 select * into strict s from public.kora_nova_sources where solicitud_id=p_source;
 if (s.registration->>'p_origen_codigo' ~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C|ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B)$') is not true then raise exception 'OUT_OF_SCOPE';end if;
 v_consent_active:=public.nova_retail_consent_current(p_source);
 perform pg_advisory_xact_lock(hashtextextended('nova-retail-customer:'||s.cliente_id::text,0));
 select * into r from public.nova_retail_cases where source_id=p_source for update;
 if found and r.fingerprint=p_fingerprint and (r.valid_until is null or r.valid_until>now()) and (v_consent_active or r.decision->'reasons' ? 'consent_revoked') then return to_jsonb(r);end if;
 v_previous_state:=r.state;
 v_revision:=coalesce(r.revision,0)+1;
 select max(rejected_at) into v_rejected from public.nova_retail_cases where cliente_id=s.cliente_id and rejected_at>now()-interval '15 days';
 if v_rejected is not null then
  v_state:='rejected';p_decision:=p_decision||jsonb_build_object('state','rejected','canProcess',false,'requiresAndrea',false,'reasons',jsonb_build_array('rejection_cooldown'),'overrideAllowed',false);
 elsif v_state='rejected' then v_rejected:=now();end if;
 if s.revoked_at is not null or v_consent_active is not true then
  v_state:='review';p_decision:=jsonb_build_object('state','review','canProcess',false,'requiresAndrea',true,'reasons',jsonb_build_array('consent_revoked'));
 end if;
 v_until:=case when v_state='authorized' then coalesce(r.renewed_at,s.submitted_at)+interval '15 days' else null end;
 if v_until<=now() then v_state:='review';p_decision:=p_decision||jsonb_build_object('state','review','canProcess',false,'requiresAndrea',true,'reasons',jsonb_build_array('renewal_required'));v_until:=null;end if;
 insert into public.nova_retail_cases(source_id,cliente_id,store_code,fingerprint,revision,state,decision,summary,rejected_at,valid_until)
 values(p_source,s.cliente_id,s.registration->>'p_origen_codigo',p_fingerprint,v_revision,v_state,p_decision,p_summary,v_rejected,v_until)
 on conflict(source_id) do update set fingerprint=excluded.fingerprint,revision=excluded.revision,state=excluded.state,decision=excluded.decision,summary=excluded.summary,rejected_at=excluded.rejected_at,valid_until=excluded.valid_until,manual_actor=null,manual_note=null,updated_at=now()
 returning * into r;
 insert into public.nova_retail_case_events(source_id,revision,actor_name,action,payload) values(p_source,r.revision,'NOVA','automatic_validation',jsonb_build_object('decision',p_decision,'summary',p_summary));
 if v_state in ('review','authorized','rejected') and v_previous_state is distinct from v_state then
  insert into public.nova_retail_notifications(source_id,revision,audience) values(p_source,r.revision,'andrea') on conflict do nothing;
  if v_state<>'review' then insert into public.nova_retail_notifications(source_id,revision,audience) values(p_source,r.revision,'store') on conflict do nothing;end if;
 end if;
 return to_jsonb(r);
end $function$;

CREATE OR REPLACE FUNCTION public.kora_nova_retail_register(p_registration jsonb, p_consent jsonb, p_photo_subject text, p_photo_hashes jsonb)
 RETURNS TABLE(cliente_id uuid, solicitud_id uuid)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.nova_retail_photo_reviews; prior public.kora_nova_sources; v_cid uuid;
begin
 if (p_registration->>'p_origen_codigo' ~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C|ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B)$') is not true then raise exception 'OUTSIDE_PILOT';end if;
 perform pg_advisory_xact_lock(hashtextextended('nova-retail-registration:'||(p_registration->>'p_cedula'),0));
 select * into prior from public.kora_nova_sources where otp_id=(p_registration->>'p_otp_id')::uuid;
 if found then return query select * from public.kora_nova_register(p_registration,p_consent);return;end if;
 select id into v_cid from public.clientes where cedula=p_registration->>'p_cedula';
 if exists(select 1 from public.kora_nova_sources s left join public.nova_retail_cases c on c.source_id=s.solicitud_id where s.cliente_id=v_cid and s.registration->>'p_origen_codigo'=p_registration->>'p_origen_codigo' and s.revoked_at is null and c.delivered_at is null) then raise exception 'RESUME_EXISTING_APPLICATION';end if;
 select * into strict r from public.nova_retail_photo_reviews where otp_id=(p_registration->>'p_otp_id')::uuid for share;
 if r.subject_hash is distinct from p_photo_subject or r.hashes is distinct from p_photo_hashes or exists(select 1 from unnest(array['frente','reverso','selfie']) t where (r.results->t->>'status' in ('auto_approved','manual_pending')) is not true) then raise exception 'PHOTO_REVIEW_REQUIRED';end if;
 return query select * from public.kora_nova_register(p_registration,p_consent);
end $function$;

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
end $function$;

CREATE OR REPLACE FUNCTION public.nova_allied_login_reserve(p_phone text, p_challenge_id uuid, p_code_hash text, p_ip_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare member public.nova_allied_login_members;
begin
 if p_phone !~ '^3[0-9]{9}$' or p_code_hash !~ '^[a-f0-9]{64}$' or p_ip_hash !~ '^[a-f0-9]{64}$'
 or p_phone is null or p_challenge_id is null or p_code_hash is null or p_ip_hash is null then raise exception 'INVALID_INPUT';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nova-allied-ip:'||p_ip_hash,0));
 if (select count(*) from public.nova_allied_login_challenges where ip_hash=p_ip_hash and created_at>now()-interval '1 hour')>=20
 then return '{"send":false}'::jsonb;end if;
 select m.* into member from public.nova_allied_login_members m
 join public.perfiles p on p.id=m.actor_id
 join public.origenes o on o.codigo=m.store_code
 where m.phone=p_phone and m.active and p.activo and p.tienda_codigo=m.store_code and o.activo
 and m.store_code in ('distritoys','ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C','club-seven','ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B')
 for update of m;
 if not found then return '{"send":false}'::jsonb;end if;
 if exists(select 1 from public.nova_allied_login_challenges where actor_id=member.actor_id and created_at>now()-interval '1 minute')
 or (select count(*) from public.nova_allied_login_challenges where actor_id=member.actor_id and created_at>now()-interval '1 hour')>=5
 then return '{"send":false}'::jsonb;end if;
 insert into public.nova_allied_login_challenges(id,actor_id,ip_hash,code_hash) values(p_challenge_id,member.actor_id,p_ip_hash,p_code_hash);
 return '{"send":true}'::jsonb;
end;$function$;

CREATE OR REPLACE FUNCTION public.nova_allied_login_session(p_session_hash text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select jsonb_build_object('actor_id',m.actor_id,'store_code',m.store_code,'name',m.name,'active',true)
 from public.nova_allied_login_sessions s join public.nova_allied_login_members m on m.actor_id=s.actor_id
 join public.perfiles p on p.id=m.actor_id join public.origenes o on o.codigo=m.store_code
 where s.session_hash=p_session_hash and s.revoked_at is null and s.expires_at>now()
 and m.active and p.activo and p.tienda_codigo=m.store_code and o.activo
 and m.store_code in ('distritoys','ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C','club-seven','ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B');
$function$;

CREATE OR REPLACE FUNCTION public.nova_client_otp_options(p_enlace_registro_id uuid, p_celular text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare p public.nova_client_otp_policy; origin_code text; day_count integer; month_count integer; month_cost numeric; cost_anomaly boolean;
begin
  select l.origen_codigo into origin_code from public.enlaces_registro l join public.origenes r on r.codigo=l.origen_codigo
    where l.id=p_enlace_registro_id and l.activo and l.revoked_at is null and r.activo;
  if origin_code is null or origin_code !~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C|ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B)$' then raise exception 'OTP_LINK_NOT_ACTIVE';end if;
  select * into strict p from public.nova_client_otp_policy where id;
  select exists(select 1 from public.nova_client_otp_dispatch where channel='sms' and reported_cost_cop>reserved_cost_cop) into cost_anomaly;
  select count(*) filter(where created_at>=date_trunc('day',now() at time zone 'America/Bogota') at time zone 'America/Bogota'),count(*),
    coalesce(sum(greatest(reserved_cost_cop,coalesce(reported_cost_cop,0))),0) into day_count,month_count,month_cost
    from public.nova_client_otp_dispatch where channel='sms'
    and created_at>=date_trunc('month',now() at time zone 'America/Bogota') at time zone 'America/Bogota'
    and (state='failed' and error_code='PROVIDER_AUTH_REJECTED'
      and provider_message_id is null and coalesce(reported_cost_cop,0)=0) is not true;
  return jsonb_build_object('smsEnabled',p.enabled and origin_code=any(p.allowed_origins) and not cost_anomaly
    and ((p.mode='active' or (p.mode='pilot' and p_celular=any(p.pilot_allowed_phones))) is true),'costAnomaly',cost_anomaly,'unitPriceCop',p.unit_price_cop,
    'dailySmsLimit',p.daily_sms_limit,'monthlySmsLimit',p.monthly_sms_limit,'monthlyBudgetCop',p.monthly_budget_cop,
    'dailySmsReserved',day_count,'monthlySmsReserved',month_count,'monthlyCostReservedCop',month_cost,
    'budgetAvailable',day_count<p.daily_sms_limit and month_count<p.monthly_sms_limit and month_cost+p.unit_price_cop<=p.monthly_budget_cop);
end $function$;

CREATE OR REPLACE FUNCTION public.nova_client_otp_reserve(p_cedula text, p_celular text, p_enlace_registro_id uuid, p_request_id uuid, p_channel text, p_selected_reason text, p_codigo_hash text, p_expira_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  d public.nova_client_otp_dispatch; o public.otp_codigos; p public.nova_client_otp_policy;
  origin_code text; new_otp uuid; cost numeric:=0; day_count integer; month_count integer;
  month_cost numeric; phone_count integer;
  day_start timestamptz:=date_trunc('day',now() at time zone 'America/Bogota') at time zone 'America/Bogota';
  month_start timestamptz:=date_trunc('month',now() at time zone 'America/Bogota') at time zone 'America/Bogota';
begin
  if (p_cedula ~ '^[0-9]{6,12}$' and p_celular ~ '^3[0-9]{9}$'
      and p_request_id is not null and p_enlace_registro_id is not null
      and p_channel in ('whatsapp','sms') and p_codigo_hash ~ '^[A-Za-z0-9_-]{43}$'
      and p_expira_at>now() and p_expira_at<=now()+interval '5 minutes') is not true
    then raise exception 'OTP_INPUT_INVALID'; end if;
  if (p_channel='sms' and p_selected_reason='no_whatsapp') is not true
      and not(p_channel='whatsapp' and p_selected_reason is null) then raise exception 'OTP_REASON_REQUIRED';end if;
  select l.origen_codigo into origin_code from public.enlaces_registro l join public.origenes r on r.codigo=l.origen_codigo
    where l.id=p_enlace_registro_id and l.activo and l.revoked_at is null and r.activo;
  if origin_code is null or origin_code !~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C|ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B)$' then raise exception 'OTP_LINK_NOT_ACTIVE';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('otp:celular:'||p_celular,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('otp:enlace:'||p_enlace_registro_id::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('otp:request:'||p_request_id::text,0));
  select * into d from public.nova_client_otp_dispatch where request_id=p_request_id;
  if found then
    select * into strict o from public.otp_codigos where id=d.otp_id;
    if o.cedula is distinct from p_cedula or o.celular is distinct from p_celular
        or d.enlace_registro_id<>p_enlace_registro_id or d.channel<>p_channel
        or d.selected_reason is distinct from p_selected_reason then raise exception 'OTP_REQUEST_CONFLICT';end if;
    return jsonb_build_object('requestId',d.request_id,'attemptId',d.attempt_id,'otpId',d.otp_id,'channel',d.channel,
      'state',d.state,'canSend',false,'reservedCostCop',d.reserved_cost_cop,'expiresAt',o.expira_at);
  end if;
  if exists(select 1 from public.otp_codigos where celular=p_celular and verificado is not true
      and registro_consumido_at is null and expira_at>now()) then raise exception 'OTP_ACTIVE';end if;
  if p_channel='sms' then
    -- Serialize global spend without granting UPDATE on policy to service_role.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('otp:sms:budget:v1',0));
    select * into strict p from public.nova_client_otp_policy where id;
    if exists(select 1 from public.nova_client_otp_dispatch where channel='sms' and reported_cost_cop>reserved_cost_cop)
      then raise exception 'SMS_COST_ANOMALY';end if;
    if not p.enabled or not(origin_code=any(p.allowed_origins)) then raise exception 'SMS_DISABLED';end if;
    if p.mode='pilot' and not(p_celular=any(p.pilot_allowed_phones)) then raise exception 'SMS_PILOT_LIMITED';end if;
    select count(*) filter(where created_at>=day_start),count(*),
      coalesce(sum(greatest(reserved_cost_cop,coalesce(reported_cost_cop,0))),0)
      into day_count,month_count,month_cost from public.nova_client_otp_dispatch
      where channel='sms' and created_at>=month_start
        and (state='failed' and error_code='PROVIDER_AUTH_REJECTED'
          and provider_message_id is null and coalesce(reported_cost_cop,0)=0) is not true;
    if day_count>=p.daily_sms_limit or month_count>=p.monthly_sms_limit
      or month_cost+p.unit_price_cop>p.monthly_budget_cop then raise exception 'SMS_BUDGET_LIMIT';end if;
    select count(*) into phone_count from public.nova_client_otp_dispatch x join public.otp_codigos y on y.id=x.otp_id
      where x.channel='sms' and y.celular=p_celular and x.created_at>=now()-interval '1 hour';
    if phone_count>=3 then raise exception 'SMS_PHONE_LIMIT';end if;
    cost:=p.unit_price_cop;
  end if;
  select otp_id into strict new_otp from public.reservar_otp_registro_seguro(
    p_cedula,p_celular,p_enlace_registro_id,p_codigo_hash,p_expira_at);
  insert into public.nova_client_otp_dispatch(request_id,otp_id,enlace_registro_id,origin_code,channel,selected_reason,reserved_cost_cop)
    values(p_request_id,new_otp,p_enlace_registro_id,origin_code,p_channel,p_selected_reason,cost) returning * into d;
  return jsonb_build_object('requestId',d.request_id,'attemptId',d.attempt_id,'otpId',d.otp_id,'channel',d.channel,
    'state',d.state,'canSend',true,'reservedCostCop',d.reserved_cost_cop,'expiresAt',p_expira_at);
end $function$;

CREATE OR REPLACE FUNCTION public.nova_client_otp_status(p_request_id uuid, p_cedula text, p_celular text, p_enlace_registro_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare d public.nova_client_otp_dispatch; o public.otp_codigos; v_state text;
begin
  perform 1 from public.enlaces_registro l join public.origenes r on r.codigo=l.origen_codigo where l.id=p_enlace_registro_id
    and l.activo and l.revoked_at is null and r.activo and l.origen_codigo ~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C|ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B)$';
  if not found then raise exception 'OTP_LINK_NOT_ACTIVE';end if;
  select x.* into d from public.nova_client_otp_dispatch x join public.otp_codigos y on y.id=x.otp_id
    where x.request_id=p_request_id and x.enlace_registro_id=p_enlace_registro_id and y.cedula=p_cedula and y.celular=p_celular;
  if not found then return jsonb_build_object('found',false);end if;
  select * into strict o from public.otp_codigos where id=d.otp_id;
  v_state:=case when o.verificado then 'verified' when o.expira_at<=now() then 'expired' else d.state end;
  return jsonb_build_object('found',true,'requestId',d.request_id,'channel',d.channel,'state',v_state,
    'expiresAt',o.expira_at,'errorCode',d.error_code,'retryAfter',case when o.verificado then 0 else greatest(0,ceil(extract(epoch from o.expira_at-now()))) end)
    || case when v_state='accepted' then jsonb_build_object('otpId',d.otp_id) else '{}'::jsonb end;
end $function$;

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
$function$;

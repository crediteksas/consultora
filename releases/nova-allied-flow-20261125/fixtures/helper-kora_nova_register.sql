CREATE OR REPLACE FUNCTION public.kora_nova_register(p_registration jsonb, p_consent jsonb)
 RETURNS TABLE(cliente_id uuid, solicitud_id uuid)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r jsonb:=p_registration; refs jsonb; h text; existing public.kora_nova_sources;
  cid uuid; sid uuid; oid uuid; c jsonb;
begin
  if jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(p_consent) is distinct from 'object'
     or octet_length(r::text)>16384 or octet_length(p_consent::text)>2048 then raise exception 'INVALID_REGISTRATION';end if;

  -- NOVA_PLATFORM_CONSENT_V1: explicit optional consent, never inferred.
  if p_consent ? 'platform_queries' then
    if (jsonb_typeof(p_consent->'platform_queries')='object'
       and p_consent->'platform_queries'->'granted'='true'::jsonb
       and p_consent->'platform_queries'->>'text_version' in ('nova-platform-query-v1','nova-platform-query-v2')
       and p_consent->'platform_queries'->'platforms'='["PAYJOY","KREDIYA","ALO"]'::jsonb) is not true
       then raise exception 'INVALID_PLATFORM_CONSENT';end if;
  end if;
  refs:=r->'p_referencias';
  if jsonb_typeof(refs) is distinct from 'array' then raise exception 'REFERENCES_REQUIRED';end if;
  if jsonb_array_length(refs)<>2 or
     (select count(distinct x->>'type') from jsonb_array_elements(refs) x)<>2 or
     (select count(distinct x->>'telefono') from jsonb_array_elements(refs) x)<>2 or
     exists(select 1 from jsonb_array_elements(refs) x where
       (x->>'type' in ('family','personal') and x->>'telefono' ~ '^3[0-9]{9}$'
        and x->>'telefono'<>r->>'p_celular' and length(btrim(x->>'nombre')) between 2 and 120
        and x->'contact_authorized'='true'::jsonb) is not true) then raise exception 'REFERENCES_REQUIRED';end if;
  if (p_consent->'granted'='true'::jsonb and
      length(btrim(p_consent->>'policy_version')) between 1 and 120 and
      length(btrim(p_consent->>'text_version')) between 1 and 120 and
      p_consent->>'policy_hash' ~ '^[0-9a-f]{64}$') is not true then raise exception 'CONSENT_REQUIRED';end if;
  if jsonb_typeof(p_consent->'channels') is distinct from 'array' then raise exception 'CONSENT_REQUIRED';end if;
  if exists(select 1 from jsonb_array_elements(p_consent->'channels') x
            where x not in ('"whatsapp"','"voice_call"','"sms"','"email"')) or
     (select count(distinct x) from jsonb_array_elements(p_consent->'channels') x)<>jsonb_array_length(p_consent->'channels')
     then raise exception 'CONSENT_REQUIRED';end if;
  if (r->>'p_cedula' ~ '^[0-9]{6,12}$' and r->>'p_celular' ~ '^3[0-9]{9}$'
      and length(btrim(r->>'p_nombre_completo')) between 3 and 120
      and length(btrim(r->>'p_ciudad')) between 2 and 120
      and length(btrim(r->>'p_direccion')) between 3 and 240
      and jsonb_typeof(r->'p_autorizacion_comercial')='boolean'
      and r->>'p_autorizacion_version'=p_consent->>'policy_version') is not true
      then raise exception 'INVALID_REGISTRATION';end if;
  if r->>'p_financiera' is not null and r->>'p_financiera' not in ('PAYJOY','ALO','KREDIYA','ADDI')
    then raise exception 'UNKNOWN_PLATFORM';end if;
  oid:=(r->>'p_otp_id')::uuid;
  if oid is null then raise exception 'OTP_REQUIRED';end if;
  h:=encode(sha256(convert_to(jsonb_build_object('registration',r,'consent',p_consent)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('kora-nova-otp:'||oid::text,0));
  select * into existing from public.kora_nova_sources s where s.otp_id=oid;
  if found then
    if existing.input_hash<>h then raise exception 'REGISTRATION_CONFLICT' using errcode='23505';end if;
    if existing.revoked_at is not null then raise exception 'CONSENT_REVOKED';end if;
    return query select existing.cliente_id,existing.solicitud_id;return;
  end if;
  perform 1 from public.origenes o where o.codigo=r->>'p_origen_codigo'
    and o.activo=true and o.tipo in ('propia','aliado');
  if not found then raise exception 'ORIGIN_INACTIVE';end if;
  select old.cliente_id,old.solicitud_id into cid,sid from public.crear_registro_cliente_seguro(
    r->>'p_cedula',r->>'p_nombre_completo',r->>'p_celular',r->>'p_email',r->>'p_ciudad',r->>'p_direccion',
    r->>'p_origen_codigo',(r->>'p_captador_id')::uuid,(r->>'p_enlace_registro_id')::uuid,oid,
    r->>'p_producto_interes',r->>'p_financiera',refs,(r->>'p_autorizacion_comercial')::boolean,r->>'p_autorizacion_version') old;
  if cid is null or sid is null then raise exception 'INVALID_REGISTRATION_RECEIPT';end if;
  c:=jsonb_build_object('granted',true,'revoked',false,'policy_version',p_consent->>'policy_version',
    'text_version',p_consent->>'text_version','policy_hash',p_consent->>'policy_hash',
    'channels',p_consent->'channels','accepted_at',now());

  if p_consent ? 'platform_queries' then
    c:=c||jsonb_build_object('platform_queries',jsonb_build_object('granted',true,'revoked',false,
      'text_version',p_consent->'platform_queries'->>'text_version','platforms',jsonb_build_array('PAYJOY','KREDIYA','ALO'),
      'accepted_at',now(),'expires_at',now()+case p_consent->'platform_queries'->>'text_version' when 'nova-platform-query-v2' then interval '360 hours' else interval '24 hours' end));
  end if;
  insert into public.kora_nova_sources(solicitud_id,cliente_id,otp_id,input_hash,registration,consent)
    values(sid,cid,oid,h,r,c);
  return query select cid,sid;
end;$function$

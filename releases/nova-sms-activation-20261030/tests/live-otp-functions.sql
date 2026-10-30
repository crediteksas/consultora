CREATE OR REPLACE FUNCTION public.nova_client_otp_finish(p_request_id uuid, p_attempt_id uuid, p_status text, p_provider_message_id text DEFAULT NULL::text, p_error_code text DEFAULT NULL::text, p_reported_cost_cop numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare d public.nova_client_otp_dispatch; o public.otp_codigos;
begin
  if (p_status in ('accepted','failed','uncertain')) is not true
    or (p_status='accepted' and p_provider_message_id is null)
    or (p_provider_message_id is not null and p_provider_message_id !~ '^[A-Za-z0-9._=:/+-]{1,200}$')
    or (p_error_code is not null and p_error_code !~ '^[A-Za-z0-9_.:-]{1,80}$')
    or (p_reported_cost_cop is not null and (p_reported_cost_cop<0 or p_reported_cost_cop>99999999))
    then raise exception 'OTP_RECEIPT_INVALID';end if;
  select x.* into strict d from public.nova_client_otp_dispatch x where x.request_id=p_request_id;
  select * into strict o from public.otp_codigos where id=d.otp_id;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('otp:celular:'||o.celular,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('otp:enlace:'||d.enlace_registro_id::text,0));
  if d.channel='sms' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('otp:sms:budget:v1',0));
  end if;
  select * into strict d from public.nova_client_otp_dispatch where request_id=p_request_id for update;
  if d.attempt_id is distinct from p_attempt_id then raise exception 'OTP_ATTEMPT_CONFLICT';end if;
  if (d.provider_message_id is not null and p_provider_message_id is not null and d.provider_message_id<>p_provider_message_id)
    or (d.reported_cost_cop is not null and p_reported_cost_cop is not null and d.reported_cost_cop<>p_reported_cost_cop)
    then raise exception 'OTP_RECEIPT_CONFLICT';end if;
  if d.state in ('accepted','failed') and d.state<>p_status then raise exception 'OTP_STATE_TERMINAL';end if;
  if p_status='accepted' then
    if o.envio_fallido_at is not null then raise exception 'OTP_DELIVERY_CONFLICT';end if;
    update public.otp_codigos set envio_aceptado_at=coalesce(envio_aceptado_at,now()) where id=d.otp_id;
  elsif p_status='failed' then
    if o.envio_aceptado_at is not null then raise exception 'OTP_DELIVERY_CONFLICT';end if;
    update public.otp_codigos set envio_fallido_at=coalesce(envio_fallido_at,now()) where id=d.otp_id;
  end if;
  update public.nova_client_otp_dispatch set state=p_status,provider_message_id=coalesce(provider_message_id,p_provider_message_id),
    error_code=coalesce(error_code,p_error_code),reported_cost_cop=coalesce(reported_cost_cop,p_reported_cost_cop),updated_at=now()
    where request_id=p_request_id returning * into d;
  return jsonb_build_object('requestId',d.request_id,'attemptId',d.attempt_id,'otpId',d.otp_id,'channel',d.channel,
    'state',d.state,'canSend',false,'reservedCostCop',d.reserved_cost_cop,'expiresAt',o.expira_at);
end $function$;

CREATE OR REPLACE FUNCTION public.nova_client_otp_metrics(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
  if (p_from is not null and p_to>p_from and p_to-p_from<=interval '32 days') is not true then raise exception 'OTP_METRICS_RANGE';end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.channel),'[]'::jsonb) into result from (
    select d.channel,count(*) as requested,count(*) filter(where d.state='reserved') as reserved,
      count(*) filter(where d.state='accepted') as accepted,count(*) filter(where d.state='uncertain') as uncertain,
      count(*) filter(where d.state='failed') as failed,count(*) filter(where o.verificado) as verified,
      coalesce(sum(d.reserved_cost_cop),0) as "budgetReservedCop",coalesce(sum(d.reported_cost_cop),0) as "costReportedCop",
      count(d.reported_cost_cop) as "costReportedCount"
    from public.nova_client_otp_dispatch d join public.otp_codigos o on o.id=d.otp_id
    where d.created_at>=p_from and d.created_at<p_to group by d.channel
  ) x;
  return jsonb_build_object('from',p_from,'to',p_to,'channels',result);
end $function$;

CREATE OR REPLACE FUNCTION public.nova_client_otp_options(p_enlace_registro_id uuid, p_celular text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare p public.nova_client_otp_policy; origin_code text; day_count integer; month_count integer; month_cost numeric; cost_anomaly boolean;
begin
  select l.origen_codigo into origin_code from public.enlaces_registro l join public.origenes r on r.codigo=l.origen_codigo
    where l.id=p_enlace_registro_id and l.activo and l.revoked_at is null and r.activo;
  if origin_code is null or origin_code !~ '^CK-0[1-9]$' then raise exception 'OTP_LINK_NOT_ACTIVE';end if;
  select * into strict p from public.nova_client_otp_policy where id;
  select exists(select 1 from public.nova_client_otp_dispatch where channel='sms' and reported_cost_cop>reserved_cost_cop) into cost_anomaly;
  select count(*) filter(where created_at>=date_trunc('day',now() at time zone 'America/Bogota') at time zone 'America/Bogota'),count(*),
    coalesce(sum(greatest(reserved_cost_cop,coalesce(reported_cost_cop,0))),0) into day_count,month_count,month_cost
    from public.nova_client_otp_dispatch where channel='sms'
    and created_at>=date_trunc('month',now() at time zone 'America/Bogota') at time zone 'America/Bogota';
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
  if origin_code is null or origin_code !~ '^CK-0[1-9]$' then raise exception 'OTP_LINK_NOT_ACTIVE';end if;
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
      where channel='sms' and created_at>=month_start;
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
    and l.activo and l.revoked_at is null and r.activo and l.origen_codigo ~ '^CK-0[1-9]$';
  if not found then raise exception 'OTP_LINK_NOT_ACTIVE';end if;
  select x.* into d from public.nova_client_otp_dispatch x join public.otp_codigos y on y.id=x.otp_id
    where x.request_id=p_request_id and x.enlace_registro_id=p_enlace_registro_id and y.cedula=p_cedula and y.celular=p_celular;
  if not found then return jsonb_build_object('found',false);end if;
  select * into strict o from public.otp_codigos where id=d.otp_id;
  v_state:=case when o.verificado then 'verified' when o.expira_at<=now() then 'expired' else d.state end;
  return jsonb_build_object('found',true,'requestId',d.request_id,'channel',d.channel,'state',v_state,
    'expiresAt',o.expira_at,'retryAfter',case when o.verificado then 0 else greatest(0,ceil(extract(epoch from o.expira_at-now()))) end)
    || case when v_state='accepted' then jsonb_build_object('otpId',d.otp_id) else '{}'::jsonb end;
end $function$;

CREATE OR REPLACE FUNCTION public.nova_client_otp_guard_sms()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('otp:celular:'||new.celular,0));
  if new.enlace_registro_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('otp:enlace:'||new.enlace_registro_id::text,0));
  end if;
  -- Includes an uncertain/failed legacy transport: a missing HTTP response
  -- is not proof of non-delivery. A verified or expired challenge is excluded.
  if exists(select 1 from public.otp_codigos o
      where o.celular=new.celular and o.enlace_registro_id is not null
        and o.codigo_hash is not null and o.verificado is not true
        and o.registro_consumido_at is null and o.expira_at>now()) then
    raise exception 'OTP_ACTIVE';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reservar_otp_registro_seguro(p_cedula text, p_celular text, p_enlace_registro_id uuid, p_codigo_hash text, p_expira_at timestamp with time zone)
 RETURNS TABLE(otp_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_envios_celular integer;
  v_envios_enlace integer;
  v_otp_id uuid;
begin
  if p_cedula !~ '^[0-9]{6,12}$'
    or p_celular !~ '^3[0-9]{9}$'
    or p_codigo_hash !~ '^[A-Za-z0-9_-]{43}$'
    or p_expira_at <= now() then
    raise exception 'otp_reserva_invalida';
  end if;

  -- Todos los callers toman los locks en el mismo orden. Las reservas
  -- concurrentes para un mismo celular o enlace quedan serializadas dentro
  -- de la transacción que cuenta e inserta el OTP.
  perform pg_advisory_xact_lock(
    hashtextextended('otp:celular:' || p_celular, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('otp:enlace:' || p_enlace_registro_id::text, 0)
  );

  select count(*) into v_envios_celular
  from public.otp_codigos
  where celular = p_celular
    and enlace_registro_id is not null
    and envio_fallido_at is null
    and (
      (
        envio_aceptado_at is not null
        and created_at >= now() - interval '1 hour'
      )
      or (
        envio_aceptado_at is null
        and created_at >= now() - interval '10 minutes'
      )
    );
  if v_envios_celular >= 3 then
    raise exception 'otp_limite_celular';
  end if;

  select count(*) into v_envios_enlace
  from public.otp_codigos
  where enlace_registro_id = p_enlace_registro_id
    and envio_fallido_at is null
    and (
      (
        envio_aceptado_at is not null
        and created_at >= now() - interval '1 hour'
      )
      or (
        envio_aceptado_at is null
        and created_at >= now() - interval '10 minutes'
      )
    );
  if v_envios_enlace >= 60 then
    raise exception 'otp_limite_enlace';
  end if;

  insert into public.otp_codigos (
    cedula, celular, enlace_registro_id, codigo_hash,
    expira_at, intentos, verificado
  ) values (
    p_cedula, p_celular, p_enlace_registro_id, p_codigo_hash,
    p_expira_at, 0, false
  )
  returning id into v_otp_id;

  return query select v_otp_id;
end;
$function$;

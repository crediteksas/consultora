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
  if origin_code is null or origin_code !~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C)$' then raise exception 'OTP_LINK_NOT_ACTIVE';end if;
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
end $function$

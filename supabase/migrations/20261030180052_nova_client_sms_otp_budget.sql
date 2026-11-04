-- LOCAL CANDIDATE ONLY. Do not apply to production without release approval.
-- Existing OTP reservation, verifier, registration, resume and photo SQL stay intact.
begin;

create table public.nova_client_otp_policy (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  mode text not null default 'pilot' check (mode in ('pilot','active')),
  pilot_allowed_phones text[] not null default '{}'::text[]
    check ((cardinality(pilot_allowed_phones)<=1 and (cardinality(pilot_allowed_phones)=0
      or (array_ndims(pilot_allowed_phones)=1 and array_lower(pilot_allowed_phones,1)=1
        and pilot_allowed_phones[1] ~ '^3[0-9]{9}$'))) is true),
  allowed_origins text[] not null default array['CK-01','CK-02','CK-03','CK-04','CK-05','CK-06','CK-07','CK-08','CK-09'],
  daily_sms_limit integer not null default 1 check (daily_sms_limit between 0 and 10),
  monthly_sms_limit integer not null default 1 check (monthly_sms_limit between 0 and 100),
  unit_price_cop numeric(12,4) not null default 39 check (unit_price_cop = 39),
  monthly_budget_cop numeric(12,4) not null default 39 check (monthly_budget_cop between 0 and 3900),
  check (allowed_origins <@ array['CK-01','CK-02','CK-03','CK-04','CK-05','CK-06','CK-07','CK-08','CK-09']::text[])
);
insert into public.nova_client_otp_policy(id) values(true);

create table public.nova_client_otp_dispatch (
  request_id uuid primary key,
  attempt_id uuid not null unique default gen_random_uuid(),
  otp_id uuid not null unique references public.otp_codigos(id),
  enlace_registro_id uuid not null references public.enlaces_registro(id),
  origin_code text not null references public.origenes(codigo),
  channel text not null check (channel in ('whatsapp','sms')),
  selected_reason text null,
  state text not null default 'reserved' check (state in ('reserved','accepted','failed','uncertain')),
  reserved_cost_cop numeric(12,4) not null default 0 check (reserved_cost_cop >= 0),
  reported_cost_cop numeric(12,4) null check (reported_cost_cop >= 0),
  provider_message_id text null check (provider_message_id ~ '^[A-Za-z0-9._=:/+-]{1,200}$'),
  error_code text null check (error_code ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (((channel='sms' and selected_reason='no_whatsapp' and reserved_cost_cop > 0)
      or (channel='whatsapp' and selected_reason is null and reserved_cost_cop=0)) is true),
  check (state<>'accepted' or provider_message_id is not null)
);
create index nova_client_otp_dispatch_sms_budget on public.nova_client_otp_dispatch(created_at) where channel='sms';
alter table public.nova_client_otp_policy enable row level security;
alter table public.nova_client_otp_dispatch enable row level security;
revoke all on public.nova_client_otp_policy, public.nova_client_otp_dispatch from public,anon,authenticated,service_role;
grant select on public.nova_client_otp_policy to service_role;
grant select,insert,update on public.nova_client_otp_dispatch to service_role;

-- Protect an SMS already reserved even if policy is later paused. Taking the
-- original caller's locks closes its in-flight race without changing that RPC.
create function public.nova_client_otp_guard_sms() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('otp:celular:'||new.celular,0));
  if new.enlace_registro_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('otp:enlace:'||new.enlace_registro_id::text,0));
  end if;
  if exists(select 1 from public.nova_client_otp_dispatch d join public.otp_codigos o on o.id=d.otp_id
      where d.channel='sms' and o.celular=new.celular and o.verificado is not true
        and o.registro_consumido_at is null and o.expira_at>now()) then
    raise exception 'OTP_ACTIVE';
  end if;
  return new;
end $$;
create trigger nova_client_otp_guard_sms before insert on public.otp_codigos
for each row execute function public.nova_client_otp_guard_sms();

create function public.nova_client_otp_reserve(
  p_cedula text,p_celular text,p_enlace_registro_id uuid,p_request_id uuid,
  p_channel text,p_selected_reason text,p_codigo_hash text,p_expira_at timestamptz
) returns jsonb language plpgsql security invoker set search_path='' as $$
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
end $$;

create function public.nova_client_otp_finish(
  p_request_id uuid,p_attempt_id uuid,p_status text,p_provider_message_id text default null,
  p_error_code text default null,p_reported_cost_cop numeric default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
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
end $$;

create function public.nova_client_otp_status(p_request_id uuid,p_cedula text,p_celular text,p_enlace_registro_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
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
end $$;

create function public.nova_client_otp_options(p_enlace_registro_id uuid,p_celular text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
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
end $$;

create function public.nova_client_otp_metrics(p_from timestamptz,p_to timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
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
end $$;

revoke all on function public.nova_client_otp_guard_sms() from public,anon,authenticated,service_role;
grant execute on function public.nova_client_otp_guard_sms() to service_role;
revoke all on function public.nova_client_otp_reserve(text,text,uuid,uuid,text,text,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.nova_client_otp_reserve(text,text,uuid,uuid,text,text,text,timestamptz) to service_role;
revoke all on function public.nova_client_otp_finish(uuid,uuid,text,text,text,numeric) from public,anon,authenticated,service_role;
grant execute on function public.nova_client_otp_finish(uuid,uuid,text,text,text,numeric) to service_role;
revoke all on function public.nova_client_otp_status(uuid,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nova_client_otp_status(uuid,text,text,uuid) to service_role;
revoke all on function public.nova_client_otp_options(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.nova_client_otp_options(uuid,text) to service_role;
revoke all on function public.nova_client_otp_metrics(timestamptz,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.nova_client_otp_metrics(timestamptz,timestamptz) to service_role;
commit;

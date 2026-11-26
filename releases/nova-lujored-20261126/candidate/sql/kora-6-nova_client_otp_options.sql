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
end $function$

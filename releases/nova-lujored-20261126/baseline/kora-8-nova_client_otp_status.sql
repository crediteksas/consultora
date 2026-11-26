CREATE OR REPLACE FUNCTION public.nova_client_otp_status(p_request_id uuid, p_cedula text, p_celular text, p_enlace_registro_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare d public.nova_client_otp_dispatch; o public.otp_codigos; v_state text;
begin
  perform 1 from public.enlaces_registro l join public.origenes r on r.codigo=l.origen_codigo where l.id=p_enlace_registro_id
    and l.activo and l.revoked_at is null and r.activo and l.origen_codigo ~ '^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C)$';
  if not found then raise exception 'OTP_LINK_NOT_ACTIVE';end if;
  select x.* into d from public.nova_client_otp_dispatch x join public.otp_codigos y on y.id=x.otp_id
    where x.request_id=p_request_id and x.enlace_registro_id=p_enlace_registro_id and y.cedula=p_cedula and y.celular=p_celular;
  if not found then return jsonb_build_object('found',false);end if;
  select * into strict o from public.otp_codigos where id=d.otp_id;
  v_state:=case when o.verificado then 'verified' when o.expira_at<=now() then 'expired' else d.state end;
  return jsonb_build_object('found',true,'requestId',d.request_id,'channel',d.channel,'state',v_state,
    'expiresAt',o.expira_at,'errorCode',d.error_code,'retryAfter',case when o.verificado then 0 else greatest(0,ceil(extract(epoch from o.expira_at-now()))) end)
    || case when v_state='accepted' then jsonb_build_object('otpId',d.otp_id) else '{}'::jsonb end;
end $function$

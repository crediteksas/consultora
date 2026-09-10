-- Aislar la única función necesaria; no conceder USAGE sobre todo kora_private.
create schema tesoreria_cuentas_private;
revoke all on schema tesoreria_cuentas_private from public,anon;
grant usage on schema tesoreria_cuentas_private to authenticated;
alter function kora_private.guardar_cuenta_ejecutivo(uuid,text,text,text,text,boolean)
 set schema tesoreria_cuentas_private;
revoke all on function tesoreria_cuentas_private.guardar_cuenta_ejecutivo(uuid,text,text,text,text,boolean) from public,anon;
grant execute on function tesoreria_cuentas_private.guardar_cuenta_ejecutivo(uuid,text,text,text,text,boolean) to authenticated;

create or replace function public.tesoreria_guardar_cuenta_ejecutivo(
 p_beneficiary_id uuid,p_identificacion text,p_banco text,p_tipo_cuenta text,
 p_numero_cuenta text,p_validar boolean default true
) returns public.beneficiary_bank_accounts
language sql security invoker set search_path='' as $$
 select tesoreria_cuentas_private.guardar_cuenta_ejecutivo(
  p_beneficiary_id,p_identificacion,p_banco,p_tipo_cuenta,p_numero_cuenta,p_validar
 )
$$;
revoke all on function public.tesoreria_guardar_cuenta_ejecutivo(uuid,text,text,text,text,boolean) from public,anon;
grant execute on function public.tesoreria_guardar_cuenta_ejecutivo(uuid,text,text,text,text,boolean) to authenticated;
notify pgrst,'reload schema';

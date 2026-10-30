-- KORA jfkmiyvcdfbsbwchyvol only. Existing guard and ACL are preserved by
-- CREATE OR REPLACE; no public grant, policy, table or OTP data is changed.
do $preflight$
begin
  if md5(pg_get_functiondef('public.nova_client_otp_guard_sms()'::regprocedure))
      <> '9a9046a33e7935940a09e4c7cb7ef04c' then
    raise exception 'NOVA_OTP_GUARD_PREDECESSOR_CHANGED';
  end if;
end;
$preflight$;

create or replace function public.nova_client_otp_guard_sms()
returns trigger
language plpgsql
set search_path to ''
as $function$
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

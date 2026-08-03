begin;
alter table public.aura_audit_log
  drop constraint if exists aura_audit_log_app_id_check;
alter table public.aura_audit_log
  add constraint aura_audit_log_app_id_check
  check (app_id is null or app_id in ('portal_b2b', 'sofia'));
revoke all on function public.aura_meta_ads_record_action(text, integer) from authenticated;
drop function if exists public.aura_meta_ads_record_action(text, integer);
revoke all on function public.aura_meta_ads_my_access() from authenticated;
drop function if exists public.aura_meta_ads_my_access();
drop table if exists public.aura_meta_ads_access;
commit;

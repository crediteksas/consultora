begin;
revoke all on function public.aura_meta_ads_record_action(text, integer) from authenticated;
drop function if exists public.aura_meta_ads_record_action(text, integer);
revoke all on function public.aura_meta_ads_my_access() from authenticated;
drop function if exists public.aura_meta_ads_my_access();
drop table if exists public.aura_meta_ads_access;
commit;

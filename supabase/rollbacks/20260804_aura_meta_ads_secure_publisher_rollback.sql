begin;

drop function if exists public.aura_meta_ads_record_publish(uuid,text[],text[],text,bigint,date,date,text,text,jsonb);
drop function if exists public.aura_meta_ads_ready_pieces();
drop table if exists public.aura_meta_ads_publications;
drop table if exists public.aura_meta_ads_cities;

update public.aura_meta_ads_access
set permissions = array['meta_ads.read']::text[], updated_at = now()
where user_id in (select id from auth.users where lower(email) = 'comercial@crediteksas.com');

alter table public.aura_meta_ads_access
  drop constraint if exists aura_meta_ads_permissions_valid;
alter table public.aura_meta_ads_access
  add constraint aura_meta_ads_permissions_valid check (
    permissions <@ array[
      'meta_ads.access','meta_ads.read','meta_ads.analyze','meta_ads.manage',
      'meta_ads.campaign.create','meta_ads.campaign.pause',
      'meta_ads.budget.manage','meta_ads.audit.read'
    ]::text[]
  );

commit;

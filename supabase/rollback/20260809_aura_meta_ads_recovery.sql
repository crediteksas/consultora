-- Rollback seguro: ejecutar después de volver el Worker y AURA Hub a sus
-- versiones anteriores. Conserva columnas aditivas y el historial existente.
begin;

drop function if exists public.aura_meta_ads_record_publish(text,text[],text[],text,text,bigint,date,date,text,text,jsonb);

update public.aura_meta_ads_cities set active = false
where origin = 'aliado' and source_reference = 'Drive · ALIADOS / cobertura comercial';

drop function if exists public.aura_meta_ads_ready_cities();
create function public.aura_meta_ads_ready_cities()
returns table(id text, name text, country_code text, active boolean)
language sql stable security definer set search_path = pg_catalog, public
as $$
  select city.id, city.name, city.country_code, city.active
  from public.aura_meta_ads_cities city
  where city.active and exists (
    select 1 from public.aura_meta_ads_access access
    where access.user_id = auth.uid() and access.active
      and 'meta_ads.publish' = any(access.permissions)
  ) order by city.name;
$$;

revoke all on function public.aura_meta_ads_ready_cities() from public, anon;
grant execute on function public.aura_meta_ads_ready_cities() to authenticated;

commit;

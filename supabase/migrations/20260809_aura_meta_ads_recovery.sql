-- Recuperación funcional de Publicación y métricas: catálogo geográfico,
-- presupuesto Meta y piezas manuales. No crea un sistema paralelo.
begin;

alter table public.aura_meta_ads_cities
  add column if not exists origin text not null default 'retail'
    check (origin in ('retail','aliado')),
  add column if not exists source_reference text;

update public.aura_meta_ads_cities
set origin = 'retail', source_reference = 'ERP · origenes/tiendas_operativas'
where id in ('tolu','corozal','chinu','cienaga-de-oro','covenas');

insert into public.aura_meta_ads_cities(id, name, country_code, active, origin, source_reference) values
  ('aliado-apartado', 'Apartadó', 'CO', true, 'aliado', 'Drive · ALIADOS / cobertura comercial'),
  ('aliado-barranquilla', 'Barranquilla', 'CO', true, 'aliado', 'Drive · ALIADOS / cobertura comercial'),
  ('aliado-canalete', 'Canalete', 'CO', true, 'aliado', 'Drive · ALIADOS / cobertura comercial'),
  ('aliado-chigorodo', 'Chigorodó', 'CO', true, 'aliado', 'Drive · ALIADOS / cobertura comercial'),
  ('aliado-el-carmen-de-bolivar', 'El Carmen de Bolívar', 'CO', true, 'aliado', 'Drive · ALIADOS / cobertura comercial'),
  ('aliado-guamal', 'Guamal', 'CO', true, 'aliado', 'Drive · ALIADOS / cobertura comercial'),
  ('aliado-los-cordobas', 'Los Córdobas', 'CO', true, 'aliado', 'Drive · ALIADOS / cobertura comercial'),
  ('aliado-malambo', 'Malambo', 'CO', true, 'aliado', 'Drive · ALIADOS / cobertura comercial'),
  ('aliado-necocli', 'Necoclí', 'CO', true, 'aliado', 'Drive · ALIADOS / cobertura comercial'),
  ('aliado-san-pedro', 'San Pedro', 'CO', true, 'aliado', 'Drive · ALIADOS / cobertura comercial'),
  ('aliado-soledad', 'Soledad', 'CO', true, 'aliado', 'Drive · ALIADOS / cobertura comercial'),
  ('aliado-suan', 'Suan', 'CO', true, 'aliado', 'Drive · ALIADOS / cobertura comercial')
on conflict (id) do update set
  name = excluded.name, country_code = excluded.country_code, active = excluded.active,
  origin = excluded.origin, source_reference = excluded.source_reference, updated_at = now();

drop function if exists public.aura_meta_ads_ready_cities();
create function public.aura_meta_ads_ready_cities()
returns table(id text, name text, country_code text, origin text, active boolean)
language sql stable security definer set search_path = pg_catalog, public
as $$
  select city.id, city.name, city.country_code, city.origin, city.active
  from public.aura_meta_ads_cities city
  where city.active and exists (
    select 1 from public.aura_meta_ads_access access
    where access.user_id = auth.uid() and access.active
      and 'meta_ads.publish' = any(access.permissions)
  )
  order by city.origin desc, city.name;
$$;

revoke all on function public.aura_meta_ads_ready_cities() from public, anon;
grant execute on function public.aura_meta_ads_ready_cities() to authenticated;

alter table public.aura_meta_ads_publications
  alter column piece_id drop not null,
  add column if not exists budget_type text not null default 'daily'
    check (budget_type in ('daily','lifetime'));

create function public.aura_meta_ads_record_publish(
  p_piece_id text, p_cities text[], p_platforms text[], p_objective text,
  p_budget_type text, p_budget_cop bigint, p_start_date date, p_end_date date,
  p_idempotency_key text, p_status text, p_meta_ids jsonb
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or p_budget_type not in ('daily','lifetime') or not exists (
    select 1 from public.aura_meta_ads_access access
    where access.user_id = auth.uid() and access.active
      and array['meta_ads.publish','meta_ads.manage','meta_ads.budget.manage']::text[] <@ access.permissions
  ) then raise exception 'Meta Ads publish permission denied'; end if;

  insert into public.aura_meta_ads_publications(
    actor_user_id, piece_id, idempotency_key, cities, platforms, objective,
    budget_type, budget_cop, start_date, end_date, status,
    campaign_id, adset_id, creative_id, ad_id
  ) values (
    auth.uid(), case when p_piece_id = 'manual' then null else p_piece_id::uuid end,
    p_idempotency_key, p_cities, p_platforms, p_objective, p_budget_type,
    p_budget_cop, p_start_date, p_end_date, p_status,
    p_meta_ids->>'campaign_id', p_meta_ids->>'adset_id',
    p_meta_ids->>'creative_id', p_meta_ids->>'ad_id'
  ) on conflict (idempotency_key) do update set
    status=excluded.status, campaign_id=excluded.campaign_id,
    adset_id=excluded.adset_id, creative_id=excluded.creative_id,
    ad_id=excluded.ad_id, updated_at=now();

  insert into public.aura_audit_log(actor_user_id, app_id, action, metadata)
  values (auth.uid(), 'meta_ads', 'meta_ads.campaign.publish', jsonb_build_object(
    'piece_id', p_piece_id, 'cities', p_cities, 'platforms', p_platforms,
    'objective', p_objective, 'budget_type', p_budget_type,
    'budget_cop', p_budget_cop, 'start_date', p_start_date, 'end_date', p_end_date,
    'status', p_status, 'meta_ids', p_meta_ids, 'idempotency_key', p_idempotency_key,
    'source', 'aura_meta_ads_worker', 'schema_version', 2
  ));
  return jsonb_build_object('ok', true, 'status', p_status, 'meta_ids', p_meta_ids);
end;
$$;

revoke all on function public.aura_meta_ads_record_publish(text,text[],text[],text,text,bigint,date,date,text,text,jsonb) from public, anon;
grant execute on function public.aura_meta_ads_record_publish(text,text[],text[],text,text,bigint,date,date,text,text,jsonb) to authenticated;

commit;

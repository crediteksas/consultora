-- Publicador seguro de AURA / Agente 3. Mantiene aislados Meta Ads, KORA y B2B.
begin;

alter table public.aura_meta_ads_access
  drop constraint if exists aura_meta_ads_permissions_valid;
alter table public.aura_meta_ads_access
  add constraint aura_meta_ads_permissions_valid check (
    permissions <@ array[
      'meta_ads.access','meta_ads.read','meta_ads.analyze','meta_ads.publish',
      'meta_ads.manage','meta_ads.campaign.create','meta_ads.campaign.pause',
      'meta_ads.budget.manage','meta_ads.audit.read'
    ]::text[]
  );

create table if not exists public.aura_meta_ads_cities (
  id text primary key,
  name text not null unique,
  country_code text not null default 'CO' check (country_code = 'CO'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.aura_meta_ads_cities(id, name, country_code, active) values
  ('tolu', 'Tolú', 'CO', true),
  ('corozal', 'Corozal', 'CO', true),
  ('chinu', 'Chinú', 'CO', true),
  ('cienaga-de-oro', 'Ciénaga de Oro', 'CO', true),
  ('covenas', 'Coveñas', 'CO', true)
on conflict (id) do update set
  name = excluded.name,
  country_code = excluded.country_code,
  active = excluded.active,
  updated_at = now();

alter table public.aura_meta_ads_cities enable row level security;
revoke all on public.aura_meta_ads_cities from public, anon, authenticated;
grant select on public.aura_meta_ads_cities to authenticated;
drop policy if exists aura_meta_ads_cities_authorized_read on public.aura_meta_ads_cities;
create policy aura_meta_ads_cities_authorized_read
  on public.aura_meta_ads_cities for select to authenticated
  using (exists (
    select 1 from public.aura_meta_ads_access access
    where access.user_id = auth.uid() and access.active
      and 'meta_ads.publish' = any(access.permissions)
  ));

create table if not exists public.aura_meta_ads_publications (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id),
  piece_id uuid not null,
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 128),
  cities text[] not null,
  platforms text[] not null,
  objective text not null,
  budget_cop bigint not null check (budget_cop between 6000 and 10000000),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  status text not null check (status in ('PAUSED','FAILED')),
  campaign_id text,
  adset_id text,
  creative_id text,
  ad_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.aura_meta_ads_publications enable row level security;
revoke all on public.aura_meta_ads_publications from public, anon, authenticated;
grant select on public.aura_meta_ads_publications to authenticated;
drop policy if exists aura_meta_ads_publications_own_read on public.aura_meta_ads_publications;
create policy aura_meta_ads_publications_own_read
  on public.aura_meta_ads_publications for select to authenticated
  using (actor_user_id = auth.uid());

create or replace function public.aura_meta_ads_ready_pieces()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(to_jsonb(piece) order by piece.fecha desc), '[]'::jsonb)
  from (
    select id, fecha, tipo, copy, headline, plataformas, estado, imagen_url
    from public.calendario_piezas
    where estado = 'lista_para_publicar' and imagen_url is not null
    order by fecha desc
    limit 100
  ) piece
  where exists (
    select 1 from public.aura_meta_ads_access access
    where access.user_id = auth.uid() and access.active
      and 'meta_ads.publish' = any(access.permissions)
  );
$$;

revoke all on function public.aura_meta_ads_ready_pieces() from public, anon;
grant execute on function public.aura_meta_ads_ready_pieces() to authenticated;

create or replace function public.aura_meta_ads_record_publish(
  p_piece_id uuid,
  p_cities text[],
  p_platforms text[],
  p_objective text,
  p_budget_cop bigint,
  p_start_date date,
  p_end_date date,
  p_idempotency_key text,
  p_status text,
  p_meta_ids jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.aura_meta_ads_access access
    where access.user_id = auth.uid() and access.active
      and array['meta_ads.publish','meta_ads.manage','meta_ads.budget.manage']::text[] <@ access.permissions
  ) then
    raise exception 'Meta Ads publish permission denied';
  end if;

  insert into public.aura_meta_ads_publications(
    actor_user_id, piece_id, idempotency_key, cities, platforms, objective,
    budget_cop, start_date, end_date, status, campaign_id, adset_id, creative_id, ad_id
  ) values (
    auth.uid(), p_piece_id, p_idempotency_key, p_cities, p_platforms, p_objective,
    p_budget_cop, p_start_date, p_end_date, p_status,
    p_meta_ids->>'campaign_id', p_meta_ids->>'adset_id', p_meta_ids->>'creative_id', p_meta_ids->>'ad_id'
  )
  on conflict (idempotency_key) do update set
    status = excluded.status,
    campaign_id = excluded.campaign_id,
    adset_id = excluded.adset_id,
    creative_id = excluded.creative_id,
    ad_id = excluded.ad_id,
    updated_at = now();

  insert into public.aura_audit_log(actor_user_id, app_id, action, metadata)
  values (auth.uid(), 'meta_ads', 'meta_ads.campaign.publish', jsonb_build_object(
    'piece_id', p_piece_id,
    'cities', p_cities,
    'platforms', p_platforms,
    'objective', p_objective,
    'budget_cop', p_budget_cop,
    'start_date', p_start_date,
    'end_date', p_end_date,
    'status', p_status,
    'meta_ids', p_meta_ids,
    'idempotency_key', p_idempotency_key,
    'source', 'aura_meta_ads_worker',
    'schema_version', 1
  ));

  return jsonb_build_object('ok', true, 'status', p_status, 'meta_ids', p_meta_ids);
end;
$$;

revoke all on function public.aura_meta_ads_record_publish(uuid,text[],text[],text,bigint,date,date,text,text,jsonb) from public, anon;
grant execute on function public.aura_meta_ads_record_publish(uuid,text[],text[],text,bigint,date,date,text,text,jsonb) to authenticated;

insert into public.aura_meta_ads_access(user_id, role_id, permissions, active)
select id, 'aura.owner', array[
  'meta_ads.access','meta_ads.read','meta_ads.analyze','meta_ads.publish',
  'meta_ads.manage','meta_ads.campaign.create','meta_ads.campaign.pause',
  'meta_ads.budget.manage','meta_ads.audit.read'
]::text[], true
from auth.users
where lower(email) = 'comercial@crediteksas.com'
on conflict (user_id) do update set
  role_id = excluded.role_id,
  permissions = excluded.permissions,
  active = true,
  updated_at = now();

commit;

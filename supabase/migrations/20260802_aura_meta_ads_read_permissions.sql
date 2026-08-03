-- Permisos aislados de AURA para Agente 3 / Meta Ads Intelligence.
-- No depende de Sofía y no habilita operaciones de escritura en Meta.
begin;

create table if not exists public.aura_meta_ads_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_id text not null check (role_id in ('aura.owner','meta_ads.reader','meta_ads.analyst','meta_ads.manager')),
  permissions text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint aura_meta_ads_permissions_valid check (
    permissions <@ array[
      'meta_ads.access','meta_ads.read','meta_ads.analyze','meta_ads.manage',
      'meta_ads.campaign.create','meta_ads.campaign.pause',
      'meta_ads.budget.manage','meta_ads.audit.read'
    ]::text[]
  )
);

alter table public.aura_meta_ads_access enable row level security;
revoke all on public.aura_meta_ads_access from public, anon, authenticated;

create or replace function public.aura_meta_ads_my_access()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'app_id', 'meta_ads',
    'role_id', access.role_id,
    'permissions', access.permissions,
    'active', access.active
  )
  from public.aura_meta_ads_access access
  where access.user_id = auth.uid();
$$;

revoke all on function public.aura_meta_ads_my_access() from public, anon;
grant execute on function public.aura_meta_ads_my_access() to authenticated;

insert into public.aura_meta_ads_access (user_id, role_id, permissions, active)
select id, 'aura.owner', array[
  'meta_ads.read'
]::text[], true
from auth.users
where lower(email) = 'comercial@crediteksas.com'
on conflict (user_id) do update
set role_id = excluded.role_id,
    permissions = excluded.permissions,
    active = true,
    updated_at = now();

commit;

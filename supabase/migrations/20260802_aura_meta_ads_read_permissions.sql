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

-- La bitácora compartida ya admite Portal B2B y Sofía. Agente 3 necesita
-- registrar únicamente sus lecturas sin relajar ninguna otra validación.
alter table public.aura_audit_log
  drop constraint if exists aura_audit_log_app_id_check;
alter table public.aura_audit_log
  add constraint aura_audit_log_app_id_check
  check (app_id is null or app_id in ('portal_b2b', 'sofia', 'meta_ads'));

-- Auditoría aislada para consultas de Meta Ads. No amplía la función
-- compartida de Portal B2B ni admite acciones o metadatos arbitrarios.
create or replace function public.aura_meta_ads_record_action(
  p_action text,
  p_period integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'AURA authentication required';
  end if;

  if p_action <> 'meta_ads.dashboard.read' then
    raise exception 'Meta Ads audit action denied';
  end if;

  if p_period is null or p_period < 1 or p_period > 90 then
    raise exception 'Meta Ads audit period invalid';
  end if;

  if not exists (
    select 1
    from public.aura_meta_ads_access access
    where access.user_id = auth.uid()
      and access.active
      and 'meta_ads.read' = any(access.permissions)
  ) then
    raise exception 'Meta Ads audit permission denied';
  end if;

  insert into public.aura_audit_log(actor_user_id, app_id, action, metadata)
  values (
    auth.uid(),
    'meta_ads',
    p_action,
    jsonb_build_object(
      'source', 'meta_ads_worker',
      'event_class', 'read_request',
      'schema_version', 1,
      'period', p_period
    )
  );

  return jsonb_build_object('ok', true, 'event_class', 'read_request');
end;
$$;

revoke all on function public.aura_meta_ads_record_action(text, integer)
  from public, anon;
grant execute on function public.aura_meta_ads_record_action(text, integer)
  to authenticated;

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

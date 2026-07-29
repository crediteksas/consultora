begin;

create extension if not exists pgcrypto;

create table if not exists public.b2b_catalog_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.b2b_user_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('catalog_admin','store')),
  store_code text,
  store_name text,
  city text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (
    (role = 'catalog_admin')
    or (role = 'store' and store_code is not null and store_name is not null and city is not null)
  )
);

create table if not exists public.b2b_catalog_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.b2b_catalog_providers(name)
values ('Conquia'), ('Inity Colombia'), ('Mundo Net'), ('Corbeta')
on conflict (name) do nothing;

create table if not exists public.b2b_catalog_settings (
  id boolean primary key default true check (id),
  utility_type text not null check (utility_type in ('fixed','percentage')),
  utility_value numeric(14,4) not null check (utility_value >= 0),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.b2b_catalog_products (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  brand text not null,
  category text not null,
  ram_gb integer,
  storage_gb integer,
  sim text,
  connectivity text,
  image_slug text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (canonical_name, ram_gb, storage_gb, sim, connectivity)
);

create table if not exists public.b2b_catalog_imports (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.b2b_catalog_providers(id),
  raw_text text not null,
  content_hash text not null,
  interpreter_version text not null,
  imported_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (provider_id, content_hash)
);

create table if not exists public.b2b_catalog_offers (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.b2b_catalog_imports(id) on delete restrict,
  provider_id uuid not null references public.b2b_catalog_providers(id),
  product_id uuid references public.b2b_catalog_products(id),
  source_reference text not null,
  interpreted_data jsonb not null default '{}'::jsonb,
  cost numeric(14,2) not null check (cost > 0),
  condition text not null check (condition in ('new','used','refurbished','a','a+','a++')),
  availability text not null check (availability in ('available','on_order','unavailable')),
  exception_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.b2b_catalog_normalization_rules (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.b2b_catalog_providers(id),
  source_reference_normalized text not null,
  product_id uuid not null references public.b2b_catalog_products(id),
  active boolean not null default true,
  approved_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (provider_id, source_reference_normalized)
);

create table if not exists public.b2b_catalog_corrections (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.b2b_catalog_offers(id),
  previous_value jsonb not null,
  corrected_value jsonb not null,
  corrected_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.b2b_catalog_versions (
  id uuid primary key default gen_random_uuid(),
  version_number bigint generated always as identity unique,
  status text not null check (status in ('draft','published','rolled_back')),
  previous_version_id uuid references public.b2b_catalog_versions(id),
  published_by uuid references auth.users(id),
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists b2b_one_published_catalog
  on public.b2b_catalog_versions ((status))
  where status = 'published';

create table if not exists public.b2b_catalog_version_items (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.b2b_catalog_versions(id) on delete restrict,
  product_id uuid not null references public.b2b_catalog_products(id),
  winning_offer_id uuid not null references public.b2b_catalog_offers(id),
  provider_id uuid not null references public.b2b_catalog_providers(id),
  frozen_cost numeric(14,2) not null check (frozen_cost > 0),
  sale_price numeric(14,2) not null check (sale_price >= frozen_cost),
  created_at timestamptz not null default now(),
  unique (version_id, product_id)
);

create table if not exists public.b2b_order_dispatches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  order_id text not null,
  store_code text not null,
  catalog_version_id uuid not null references public.b2b_catalog_versions(id),
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  public_response jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id, order_id)
);

create or replace function public.b2b_is_catalog_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.b2b_catalog_admins a
    where a.user_id = p_user_id and a.active
  );
$$;

create or replace view public.b2b_catalog_public
with (security_barrier = true)
as
select
  vi.id as catalog_item_id,
  p.id as canonical_product_id,
  p.canonical_name as nombre,
  p.brand as marca,
  p.category as categoria,
  vi.sale_price as "precioVenta",
  p.image_slug
from public.b2b_catalog_versions v
join public.b2b_catalog_version_items vi on vi.version_id = v.id
join public.b2b_catalog_products p on p.id = vi.product_id
where v.status = 'published' and p.active;

create or replace function public.resolve_b2b_order_items(
  p_user_id uuid,
  p_order_id text,
  p_store_code text,
  p_store_name text,
  p_city text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access public.b2b_user_access%rowtype;
  v_version_id uuid;
  v_existing public.b2b_order_dispatches%rowtype;
  v_items jsonb;
  v_total_units integer;
  v_total_sale numeric;
begin
  if p_user_id is null or p_order_id is null or p_order_id = '' then
    raise exception 'Pedido inválido';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido está vacío';
  end if;

  select * into v_access from public.b2b_user_access where user_id = p_user_id and active is true;
  if not found then raise exception 'Usuario sin acceso B2B activo'; end if;
  if v_access.role = 'store' and (
    v_access.store_code is distinct from p_store_code
    or v_access.store_name is distinct from p_store_name
    or v_access.city is distinct from p_city
  ) then
    raise exception 'La tienda no corresponde al usuario';
  end if;

  select * into v_existing
  from public.b2b_order_dispatches
  where user_id = p_user_id and order_id = p_order_id;
  if found and v_existing.status = 'sent' then
    return jsonb_build_object(
      'duplicate', true,
      'response', coalesce(v_existing.public_response, jsonb_build_object('ok', false, 'error', 'Pedido en proceso'))
    );
  end if;

  v_version_id := v_existing.catalog_version_id;
  if v_version_id is null then
    select id into v_version_id from public.b2b_catalog_versions where status = 'published';
  end if;
  if v_version_id is null then raise exception 'No existe un catálogo publicado'; end if;

  with requested as (
    select
      (entry->>'catalog_item_id')::uuid as catalog_item_id,
      (entry->>'quantity')::integer as quantity
    from jsonb_array_elements(p_items) entry
  ), resolved as (
    select
      vi.id,
      p.canonical_name,
      pr.name as provider_name,
      r.quantity,
      vi.frozen_cost,
      vi.sale_price
    from requested r
    join public.b2b_catalog_version_items vi
      on vi.id = r.catalog_item_id and vi.version_id = v_version_id
    join public.b2b_catalog_products p on p.id = vi.product_id
    join public.b2b_catalog_providers pr on pr.id = vi.provider_id
    where r.quantity between 1 and 999
  )
  select
    jsonb_agg(jsonb_build_object(
      'tienda', p_store_name,
      'ciudad', p_city,
      'producto', canonical_name,
      'proveedor', provider_name,
      'cantidad', quantity,
      'precioProveedor', frozen_cost,
      'precioCredilek', sale_price,
      'numeroPedido', p_order_id
    )),
    sum(quantity)::integer,
    sum(quantity * sale_price)
  into v_items, v_total_units, v_total_sale
  from resolved;

  if coalesce(jsonb_array_length(v_items), 0) <> jsonb_array_length(p_items) then
    raise exception 'Uno o más productos no pertenecen al catálogo publicado';
  end if;

  insert into public.b2b_order_dispatches(user_id, order_id, store_code, catalog_version_id)
  values (p_user_id, p_order_id, p_store_code, v_version_id)
  on conflict (user_id, order_id) do update
  set status = 'pending';

  return jsonb_build_object(
    'duplicate', false,
    'items', v_items,
    'total_units', v_total_units,
    'total_sale', v_total_sale
  );
end;
$$;

create or replace function public.publish_b2b_catalog(p_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current uuid;
begin
  if not public.b2b_is_catalog_admin() then raise exception 'Acceso denegado'; end if;
  if exists (
    with latest_imports as (
      select distinct on (provider_id) id
      from public.b2b_catalog_imports
      order by provider_id, created_at desc
    )
    select 1
    from public.b2b_catalog_offers o
    join latest_imports li on li.id = o.import_id
    where o.exception_type in ('unmatched', 'missing_image', 'suspicious_price')
  ) then
    raise exception 'Resuelve las referencias nuevas, precios sospechosos y fotografías faltantes antes de publicar';
  end if;
  if not exists (
    select 1
    from public.b2b_catalog_version_items vi
    join public.b2b_catalog_products p on p.id = vi.product_id
    where vi.version_id = p_version_id and p.image_slug is not null
  ) then
    raise exception 'La versión no contiene productos publicables con imagen';
  end if;
  if exists (
    select 1
    from public.b2b_catalog_version_items vi
    join public.b2b_catalog_products p on p.id = vi.product_id
    where vi.version_id = p_version_id and p.image_slug is null
  ) then
    raise exception 'Existen referencias sin imagen';
  end if;

  select id into v_current from public.b2b_catalog_versions where status = 'published' for update;
  if v_current = p_version_id then return p_version_id; end if;

  if v_current is not null then
    update public.b2b_catalog_versions set status = 'rolled_back' where id = v_current;
  end if;
  update public.b2b_catalog_versions
  set status = 'published',
      previous_version_id = coalesce(previous_version_id, v_current),
      published_by = auth.uid(),
      published_at = now()
  where id = p_version_id and status = 'draft';
  if not found then raise exception 'Versión no disponible para publicación'; end if;
  return p_version_id;
end;
$$;

create or replace function public.set_b2b_catalog_utility(
  p_utility_type text,
  p_utility_value numeric
)
returns public.b2b_catalog_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_setting public.b2b_catalog_settings%rowtype;
begin
  if not public.b2b_is_catalog_admin() then raise exception 'Acceso denegado'; end if;
  if p_utility_type not in ('fixed', 'percentage') then
    raise exception 'Tipo de utilidad inválido';
  end if;
  if p_utility_value is null or p_utility_value < 0 then
    raise exception 'Valor de utilidad inválido';
  end if;

  insert into public.b2b_catalog_settings(id, utility_type, utility_value, updated_by, updated_at)
  values (true, p_utility_type, p_utility_value, auth.uid(), now())
  on conflict (id) do update
  set utility_type = excluded.utility_type,
      utility_value = excluded.utility_value,
      updated_by = auth.uid(),
      updated_at = now()
  returning * into v_setting;

  return v_setting;
end;
$$;

create or replace function public.build_b2b_catalog_draft(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version_id uuid;
  v_setting public.b2b_catalog_settings%rowtype;
  v_preview jsonb;
begin
  if not public.b2b_is_catalog_admin(p_user_id) then raise exception 'Acceso denegado'; end if;
  select * into v_setting from public.b2b_catalog_settings where id = true;
  if not found then raise exception 'Configura la regla de utilidad antes de generar el catálogo'; end if;

  insert into public.b2b_catalog_versions(status, published_by)
  values ('draft', p_user_id)
  returning id into v_version_id;

  with latest_imports as (
    select distinct on (provider_id) id
    from public.b2b_catalog_imports
    order by provider_id, created_at desc
  ), eligible as (
    select
      o.*,
      row_number() over (partition by o.product_id order by o.cost asc, o.created_at desc) as winner_rank
    from public.b2b_catalog_offers o
    join latest_imports li on li.id = o.import_id
    join public.b2b_catalog_products p on p.id = o.product_id and p.active and p.image_slug is not null
    where o.condition = 'new'
      and o.availability = 'available'
      and o.exception_type is null
  )
  insert into public.b2b_catalog_version_items(
    version_id, product_id, winning_offer_id, provider_id, frozen_cost, sale_price
  )
  select
    v_version_id,
    product_id,
    id,
    provider_id,
    cost,
    case
      when v_setting.utility_type = 'fixed' then cost + v_setting.utility_value
      else round(cost * (1 + v_setting.utility_value / 100.0), 2)
    end
  from eligible
  where winner_rank = 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'catalog_item_id', vi.id,
    'name', p.canonical_name,
    'provider_name', pr.name,
    'cost', vi.frozen_cost,
    'sale_price', vi.sale_price,
    'image_status', case when p.image_slug is null then 'Falta imagen' else 'Lista' end
  ) order by p.canonical_name), '[]'::jsonb)
  into v_preview
  from public.b2b_catalog_version_items vi
  join public.b2b_catalog_products p on p.id = vi.product_id
  join public.b2b_catalog_providers pr on pr.id = vi.provider_id
  where vi.version_id = v_version_id;

  return jsonb_build_object('version_id', v_version_id, 'preview', v_preview);
end;
$$;

create or replace function public.correct_b2b_catalog_offer(p_offer_id uuid, p_product_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.b2b_catalog_offers%rowtype;
  v_image_slug text;
  v_previous jsonb;
begin
  if not public.b2b_is_catalog_admin() then raise exception 'Acceso denegado'; end if;
  select * into v_offer from public.b2b_catalog_offers where id = p_offer_id for update;
  if not found then raise exception 'Oferta inexistente'; end if;
  select image_slug into v_image_slug
  from public.b2b_catalog_products
  where id = p_product_id and active;
  if not found then
    raise exception 'Referencia canónica inexistente';
  end if;
  v_previous := to_jsonb(v_offer);
  update public.b2b_catalog_offers
  set product_id = p_product_id,
      exception_type = case when v_image_slug is null then 'missing_image' else null end
  where id = p_offer_id;
  insert into public.b2b_catalog_normalization_rules(
    provider_id, source_reference_normalized, product_id, approved_by
  ) values (
    v_offer.provider_id,
    upper(regexp_replace(trim(v_offer.source_reference), '\s+', ' ', 'g')),
    p_product_id,
    auth.uid()
  )
  on conflict (provider_id, source_reference_normalized)
  do update set product_id = excluded.product_id, active = true, approved_by = auth.uid(), created_at = now();
  insert into public.b2b_catalog_corrections(offer_id, previous_value, corrected_value, corrected_by)
  values (
    p_offer_id,
    v_previous,
    jsonb_build_object(
      'product_id', p_product_id,
      'exception_type', case when v_image_slug is null then 'missing_image' else null end
    ),
    auth.uid()
  );
  return p_offer_id;
end;
$$;

create or replace function public.rollback_b2b_catalog(p_target_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current uuid;
begin
  if not public.b2b_is_catalog_admin() then raise exception 'Acceso denegado'; end if;
  select id into v_current from public.b2b_catalog_versions where status = 'published' for update;
  if not exists (select 1 from public.b2b_catalog_versions where id = p_target_version_id) then
    raise exception 'Versión de rollback inexistente';
  end if;
  if v_current = p_target_version_id then return p_target_version_id; end if;
  update public.b2b_catalog_versions set status = 'rolled_back' where id = v_current;
  update public.b2b_catalog_versions
  set status = 'published', published_by = auth.uid(), published_at = now()
  where id = p_target_version_id;
  return p_target_version_id;
end;
$$;

create or replace view public.b2b_catalog_price_history
as
select
  o.product_id,
  p.canonical_name,
  pr.name as provider_name,
  o.cost,
  o.condition,
  o.availability,
  o.created_at,
  exists (
    select 1 from public.b2b_catalog_version_items vi where vi.winning_offer_id = o.id
  ) as won
from public.b2b_catalog_offers o
join public.b2b_catalog_products p on p.id = o.product_id
join public.b2b_catalog_providers pr on pr.id = o.provider_id
where public.b2b_is_catalog_admin();

create or replace view public.b2b_catalog_provider_stats
as
select
  pr.id as provider_id,
  pr.name as provider_name,
  count(o.id) filter (where o.product_id is not null) as comparable_offers,
  count(vi.id) as won_references,
  case
    when count(o.id) filter (where o.product_id is not null) = 0 then 0
    else round(
      100.0 * count(vi.id) / count(o.id) filter (where o.product_id is not null),
      2
    )
  end as won_percentage,
  date_trunc('month', o.created_at) as month,
  avg(o.cost) as average_cost
from public.b2b_catalog_providers pr
left join public.b2b_catalog_offers o on o.provider_id = pr.id
left join public.b2b_catalog_version_items vi on vi.winning_offer_id = o.id
where public.b2b_is_catalog_admin()
group by pr.id, pr.name, date_trunc('month', o.created_at);

alter table public.b2b_catalog_admins enable row level security;
alter table public.b2b_user_access enable row level security;
alter table public.b2b_catalog_providers enable row level security;
alter table public.b2b_catalog_settings enable row level security;
alter table public.b2b_catalog_products enable row level security;
alter table public.b2b_catalog_imports enable row level security;
alter table public.b2b_catalog_offers enable row level security;
alter table public.b2b_catalog_normalization_rules enable row level security;
alter table public.b2b_catalog_corrections enable row level security;
alter table public.b2b_catalog_versions enable row level security;
alter table public.b2b_catalog_version_items enable row level security;
alter table public.b2b_order_dispatches enable row level security;

create policy b2b_admin_manage_providers on public.b2b_catalog_providers
  for all to authenticated using (public.b2b_is_catalog_admin()) with check (public.b2b_is_catalog_admin());
create policy b2b_admin_manage_products on public.b2b_catalog_products
  for all to authenticated using (public.b2b_is_catalog_admin()) with check (public.b2b_is_catalog_admin());
create policy b2b_admin_manage_settings on public.b2b_catalog_settings
  for all to authenticated using (public.b2b_is_catalog_admin()) with check (public.b2b_is_catalog_admin());
create policy b2b_admin_manage_imports on public.b2b_catalog_imports
  for all to authenticated using (public.b2b_is_catalog_admin()) with check (public.b2b_is_catalog_admin());
create policy b2b_admin_manage_offers on public.b2b_catalog_offers
  for all to authenticated using (public.b2b_is_catalog_admin()) with check (public.b2b_is_catalog_admin());
create policy b2b_admin_manage_rules on public.b2b_catalog_normalization_rules
  for all to authenticated using (public.b2b_is_catalog_admin()) with check (public.b2b_is_catalog_admin());
create policy b2b_admin_manage_corrections on public.b2b_catalog_corrections
  for all to authenticated using (public.b2b_is_catalog_admin()) with check (public.b2b_is_catalog_admin());
create policy b2b_admin_manage_versions on public.b2b_catalog_versions
  for all to authenticated using (public.b2b_is_catalog_admin()) with check (public.b2b_is_catalog_admin());
create policy b2b_admin_manage_version_items on public.b2b_catalog_version_items
  for all to authenticated using (public.b2b_is_catalog_admin()) with check (public.b2b_is_catalog_admin());
create policy b2b_user_read_own_dispatches on public.b2b_order_dispatches
  for select to authenticated using (user_id = auth.uid());
create policy b2b_user_read_own_access on public.b2b_user_access
  for select to authenticated using (user_id = auth.uid());

revoke all on public.b2b_catalog_admins from anon, authenticated;
revoke all on public.b2b_user_access from anon;
grant select on public.b2b_user_access to authenticated;
revoke all on public.b2b_catalog_providers, public.b2b_catalog_products,
  public.b2b_catalog_settings,
  public.b2b_catalog_imports, public.b2b_catalog_offers,
  public.b2b_catalog_normalization_rules, public.b2b_catalog_corrections,
  public.b2b_catalog_versions, public.b2b_catalog_version_items
  from anon;
grant select, insert, update on public.b2b_catalog_providers, public.b2b_catalog_products,
  public.b2b_catalog_settings,
  public.b2b_catalog_imports, public.b2b_catalog_offers,
  public.b2b_catalog_normalization_rules, public.b2b_catalog_corrections,
  public.b2b_catalog_versions, public.b2b_catalog_version_items
  to authenticated;
grant select on public.b2b_catalog_public to authenticated;
grant select on public.b2b_catalog_price_history, public.b2b_catalog_provider_stats to authenticated;
grant execute on function public.b2b_is_catalog_admin(uuid) to authenticated;
grant execute on function public.publish_b2b_catalog(uuid) to authenticated;
grant execute on function public.rollback_b2b_catalog(uuid) to authenticated;
grant execute on function public.correct_b2b_catalog_offer(uuid,uuid) to authenticated;
grant execute on function public.set_b2b_catalog_utility(text,numeric) to authenticated;
revoke execute on function public.resolve_b2b_order_items(uuid,text,text,text,text,jsonb) from public, anon, authenticated;
revoke execute on function public.build_b2b_catalog_draft(uuid) from public, anon, authenticated;

commit;

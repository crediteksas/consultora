begin;

alter table public.clientes
  add column if not exists optin_whatsapp boolean not null default false,
  add column if not exists optin_version text,
  add column if not exists optin_evidence_id text;

create table if not exists public.sofia_consent_events (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete cascade,
  telefono text not null,
  purpose text not null check (purpose in ('datos','operativo','comercial_whatsapp')),
  decision text not null check (decision in ('granted','denied','revoked')),
  policy_version text not null,
  prompt_text text not null,
  response_text text not null,
  channel text not null,
  source_message_id text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists sofia_consent_events_source_unique
  on public.sofia_consent_events(source_message_id, purpose)
  where source_message_id is not null;
create index if not exists sofia_consent_events_cliente_idx
  on public.sofia_consent_events(cliente_id, occurred_at desc);

create table if not exists public.sofia_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  objective text,
  status text not null default 'draft' check (status in ('draft','ready','scheduled','running','paused','completed','cancelled')),
  template_name text not null,
  template_language text not null default 'es_CO',
  template_meta_status text not null default 'unknown' check (template_meta_status in ('unknown','pending','approved','paused','rejected','disabled')),
  header_media_url text,
  segment jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sofia_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.sofia_campaigns(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  telefono text not null,
  eligibility_status text not null check (eligibility_status in ('eligible','excluded')),
  exclusion_reason text,
  send_status text not null default 'pending' check (send_status in ('pending','queued','accepted','sent','delivered','read','replied','failed','suppressed')),
  meta_message_id text,
  error_code text,
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, telefono)
);

create index if not exists sofia_campaign_recipients_status_idx
  on public.sofia_campaign_recipients(campaign_id, send_status);
create unique index if not exists sofia_campaign_recipients_meta_message_idx
  on public.sofia_campaign_recipients(meta_message_id)
  where meta_message_id is not null;

create table if not exists public.sofia_campaign_suppressions (
  telefono text primary key,
  active boolean not null default true,
  reason text not null,
  source text not null,
  source_message_id text,
  suppressed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.sofia_consent_events enable row level security;
alter table public.sofia_campaigns enable row level security;
alter table public.sofia_campaign_recipients enable row level security;
alter table public.sofia_campaign_suppressions enable row level security;

comment on table public.sofia_campaigns is 'Borradores y ejecuciones de campañas de Sofía. La v1 no habilita envíos sin aprobación explícita.';
comment on table public.sofia_campaign_suppressions is 'Lista de exclusión obligatoria para campañas por WhatsApp.';

commit;

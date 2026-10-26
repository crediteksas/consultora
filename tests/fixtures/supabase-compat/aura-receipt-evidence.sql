-- Isolated, append-only transport evidence. No customer/consent updates.
create table public.sofia_delivery_events (
  event_key text primary key,
  attempt_id uuid,
  source_message_id text,
  message_id text,
  recipient text not null,
  status text not null check (status in ('attempted','accepted','unknown','rejected','sent','delivered','read','failed')),
  evidence_source text not null check (evidence_source in ('send_api','signed_webhook')),
  event_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  message_type text check (message_type in ('text','interactive')),
  buttons jsonb not null default '[]'::jsonb check (jsonb_typeof(buttons)='array'),
  http_status integer,
  error_code text,
  check ((evidence_source='send_api' and status in ('attempted','accepted','unknown','rejected') and attempt_id is not null)
    or (evidence_source='signed_webhook' and status in ('sent','delivered','read','failed') and message_id is not null))
);
create index sofia_delivery_events_recipient_time on public.sofia_delivery_events(recipient,event_at desc);
create index sofia_delivery_events_message on public.sofia_delivery_events(message_id) where message_id is not null;
alter table public.sofia_delivery_events enable row level security;
revoke all on public.sofia_delivery_events from public, anon, authenticated, service_role;
grant select,insert on public.sofia_delivery_events to service_role;
comment on table public.sofia_delivery_events is 'Sofia evidence only: API acceptance is not delivery, reading, consent, or human confirmation. No automatic commercial resends.';

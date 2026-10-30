create table public.nova_client_otp_policy (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  mode text not null default 'pilot' check (mode in ('pilot','active')),
  pilot_allowed_phones text[] not null default '{}'::text[]
    check ((cardinality(pilot_allowed_phones)<=1 and (cardinality(pilot_allowed_phones)=0
      or (array_ndims(pilot_allowed_phones)=1 and array_lower(pilot_allowed_phones,1)=1
        and pilot_allowed_phones[1] ~ '^3[0-9]{9}$'))) is true),
  allowed_origins text[] not null default array['CK-01','CK-02','CK-03','CK-04','CK-05','CK-06','CK-07','CK-08','CK-09'],
  daily_sms_limit integer not null default 1 check (daily_sms_limit between 0 and 10),
  monthly_sms_limit integer not null default 1 check (monthly_sms_limit between 0 and 100),
  unit_price_cop numeric(12,4) not null default 39 check (unit_price_cop = 39),
  monthly_budget_cop numeric(12,4) not null default 39 check (monthly_budget_cop between 0 and 3900),
  check (allowed_origins <@ array['CK-01','CK-02','CK-03','CK-04','CK-05','CK-06','CK-07','CK-08','CK-09']::text[])
);
insert into public.nova_client_otp_policy(id) values(true);

create table public.nova_client_otp_dispatch (
  request_id uuid primary key,
  attempt_id uuid not null unique default gen_random_uuid(),
  otp_id uuid not null unique references public.otp_codigos(id),
  enlace_registro_id uuid not null references public.enlaces_registro(id),
  origin_code text not null references public.origenes(codigo),
  channel text not null check (channel in ('whatsapp','sms')),
  selected_reason text null,
  state text not null default 'reserved' check (state in ('reserved','accepted','failed','uncertain')),
  reserved_cost_cop numeric(12,4) not null default 0 check (reserved_cost_cop >= 0),
  reported_cost_cop numeric(12,4) null check (reported_cost_cop >= 0),
  provider_message_id text null check (provider_message_id ~ '^[A-Za-z0-9._=:/+-]{1,200}$'),
  error_code text null check (error_code ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (((channel='sms' and selected_reason='no_whatsapp' and reserved_cost_cop > 0)
      or (channel='whatsapp' and selected_reason is null and reserved_cost_cop=0)) is true),
  check (state<>'accepted' or provider_message_id is not null)
);
create index nova_client_otp_dispatch_sms_budget on public.nova_client_otp_dispatch(created_at) where channel='sms';
alter table public.nova_client_otp_policy enable row level security;
alter table public.nova_client_otp_dispatch enable row level security;
revoke all on public.nova_client_otp_policy, public.nova_client_otp_dispatch from public,anon,authenticated,service_role;
grant select on public.nova_client_otp_policy to service_role;
grant select,insert,update on public.nova_client_otp_dispatch to service_role;


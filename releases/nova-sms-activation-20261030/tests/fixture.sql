-- Synthetic, isolated PostgreSQL fixture. No customer data or production IO.
create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.origenes(codigo text primary key,activo boolean not null default true);
create table public.enlaces_registro(id uuid primary key default gen_random_uuid(),token_hash text unique,
 token_sufijo text,origen_codigo text references public.origenes(codigo),captador_id uuid,activo boolean not null default true,
 created_at timestamptz default now(),revoked_at timestamptz,ultima_utilizacion_at timestamptz);
create table public.otp_codigos(id uuid primary key default gen_random_uuid(),cedula text,celular text,codigo text default 'HASHED',
 enlace_registro_id uuid references public.enlaces_registro(id),codigo_hash text,expira_at timestamptz,created_at timestamptz default now(),
 intentos integer default 0,verificado boolean default false,registro_consumido_at timestamptz,envio_aceptado_at timestamptz,envio_fallido_at timestamptz);
-- Matches current metadata: broad grants exist, but RLS has no anon/auth policy.
grant all on public.otp_codigos to anon,authenticated,service_role;
alter table public.otp_codigos enable row level security;
create table public.clientes(id uuid primary key,cedula text,celular text);
create table public.kora_nova_sources(solicitud_id uuid primary key,cliente_id uuid,registration jsonb,revoked_at timestamptz,
 submitted_at timestamptz default now(),otp_id uuid references public.otp_codigos(id));
create table public.nova_retail_cases(source_id uuid primary key,delivered_at timestamptz);
create table public.documentos_solicitud(solicitud_id uuid,tipo text,sha256 text,storage_path text,primary key(solicitud_id,tipo));
create table public.nova_retail_photo_reviews(otp_id uuid primary key,subject_hash text,results jsonb default '{}',hashes jsonb default '{}',
 failures jsonb default '{}',lease_until timestamptz,updated_at timestamptz default now());
grant usage on schema public to service_role;
grant select,insert,update on public.otp_codigos,public.clientes,public.kora_nova_sources,public.nova_retail_cases,
 public.documentos_solicitud,public.nova_retail_photo_reviews,public.enlaces_registro,public.origenes to service_role;

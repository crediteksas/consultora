create table if not exists public.creditos_historicos_plataforma (
  id uuid primary key default gen_random_uuid(),
  plataforma text not null check (plataforma in ('payjoy', 'alo')),
  codigo_credito text not null,
  fecha_credito timestamptz,
  estado text not null default 'activo',
  cliente_documento text,
  cliente_nombre text,
  cliente_celular text,
  cliente_email text,
  establecimiento text,
  vendedor text,
  imei text,
  referencia text,
  modelo text,
  plazo_meses integer,
  monto_credito numeric not null default 0,
  cuota_inicial numeric not null default 0,
  archivo_origen text not null,
  correo_origen_at timestamptz,
  datos_origen jsonb not null default '{}'::jsonb,
  importado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  constraint creditos_historicos_plataforma_codigo_uk unique (plataforma, codigo_credito)
);

create index if not exists creditos_historicos_plataforma_documento_idx
  on public.creditos_historicos_plataforma (cliente_documento);

create index if not exists creditos_historicos_plataforma_imei_idx
  on public.creditos_historicos_plataforma (imei);

create index if not exists creditos_historicos_plataforma_fecha_idx
  on public.creditos_historicos_plataforma (fecha_credito desc);

alter table public.creditos_historicos_plataforma enable row level security;

revoke all on table public.creditos_historicos_plataforma from anon;
revoke all on table public.creditos_historicos_plataforma from authenticated;
grant select on table public.creditos_historicos_plataforma to authenticated;
grant all on table public.creditos_historicos_plataforma to service_role;

drop policy if exists creditos_historicos_lectura_personal_activo
  on public.creditos_historicos_plataforma;

create policy creditos_historicos_lectura_personal_activo
  on public.creditos_historicos_plataforma
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.perfiles p
      where p.id = (select auth.uid())
        and p.activo is true
    )
  );

comment on table public.creditos_historicos_plataforma is
  'Histórico idempotente de créditos originados en PayJoy y ALO Credit; no genera ventas, inventario, caja, bonos ni liquidaciones.';

comment on column public.creditos_historicos_plataforma.codigo_credito is
  'Identificador único del crédito dentro de la plataforma; evita cargas duplicadas.';

begin;

create table if not exists public.aliados_metas_plataforma (
  id uuid primary key default gen_random_uuid(),
  plataforma text not null references public.liquidation_platforms(id),
  periodo_desde date not null,
  periodo_hasta date not null,
  meta_creditos integer not null check (meta_creditos > 0),
  incentivo_base numeric(16,2) not null default 0 check (incentivo_base >= 0),
  valor_credito_adicional numeric(16,2) not null default 0 check (valor_credito_adicional >= 0),
  fpd7_max_pct numeric(5,2) check (fpd7_max_pct between 0 and 100),
  estado text not null default 'vigente' check (estado in ('borrador','vigente','cerrada','anulada')),
  fuente text not null,
  fuente_referencia text,
  capacitacion_at timestamptz,
  notas text,
  created_by uuid references public.perfiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (periodo_hasta >= periodo_desde),
  unique (plataforma, periodo_desde, periodo_hasta)
);

alter table public.aliados_metas_plataforma enable row level security;

drop policy if exists aliados_metas_plataforma_select on public.aliados_metas_plataforma;
create policy aliados_metas_plataforma_select on public.aliados_metas_plataforma
for select to authenticated using ((select public.tiene_capacidad_aliados('revisor')));

drop policy if exists aliados_metas_plataforma_insert on public.aliados_metas_plataforma;
create policy aliados_metas_plataforma_insert on public.aliados_metas_plataforma
for insert to authenticated with check ((select public.tiene_capacidad_aliados('aprobador')));

drop policy if exists aliados_metas_plataforma_update on public.aliados_metas_plataforma;
create policy aliados_metas_plataforma_update on public.aliados_metas_plataforma
for update to authenticated using ((select public.tiene_capacidad_aliados('aprobador')))
with check ((select public.tiene_capacidad_aliados('aprobador')));

grant select, insert, update on public.aliados_metas_plataforma to authenticated;

insert into public.aliados_metas_plataforma (
  plataforma, periodo_desde, periodo_hasta, meta_creditos, incentivo_base,
  valor_credito_adicional, fpd7_max_pct, estado, fuente, fuente_referencia,
  capacitacion_at, notas
)
values (
  'alo', date '2026-09-01', date '2026-09-30', 60, 1200000,
  20000, 16, 'vigente', 'Comunicacion oficial ALO Credit',
  'gmail:1a069a9607b5b836', timestamptz '2026-09-09 00:00:00-05',
  'Capacitacion sobre cartera y prevencion del fraude. El incentivo es potencial y esta sujeto al cumplimiento de la meta y a la validacion de FPD7.'
)
on conflict (plataforma, periodo_desde, periodo_hasta) do update set
  meta_creditos=excluded.meta_creditos, incentivo_base=excluded.incentivo_base,
  valor_credito_adicional=excluded.valor_credito_adicional, fpd7_max_pct=excluded.fpd7_max_pct,
  estado=excluded.estado, fuente=excluded.fuente, fuente_referencia=excluded.fuente_referencia,
  capacitacion_at=excluded.capacitacion_at, notas=excluded.notas, updated_at=now();

commit;

-- Acta informativa del resultado retirado por Gerencia; no registra pagos,
-- movimientos de caja/banco ni cambia los resultados originales de los negocios.
create table if not exists public.utilidades_cierres_negocio (
  id uuid primary key default gen_random_uuid(),
  periodo date not null,
  negocio text not null check (negocio in ('retail', 'b2b', 'aliados')),
  utilidad_neta numeric(16, 2) not null,
  retiro_declarado numeric(16, 2) not null check (retiro_declarado >= 0),
  disponible numeric(16, 2) generated always as (utilidad_neta - retiro_declarado) stored,
  componentes jsonb not null,
  declaracion text not null,
  registrado_at timestamptz not null default now(),
  unique (periodo, negocio),
  check (extract(day from periodo) = 1),
  check (retiro_declarado <= greatest(utilidad_neta, 0))
);

comment on table public.utilidades_cierres_negocio is
  'Acta gerencial del resultado neto de un mes y su retiro declarado. No es un pago ni altera caja, Banco o Tesorería.';
comment on column public.utilidades_cierres_negocio.disponible is
  'Remanente informativo del cierre; no representa efectivo ni saldo bancario.';

alter table public.utilidades_cierres_negocio enable row level security;
revoke all on public.utilidades_cierres_negocio from public, anon, authenticated;
grant select on public.utilidades_cierres_negocio to authenticated;
grant all on public.utilidades_cierres_negocio to service_role;

create policy utilidades_cierres_negocio_lectura
  on public.utilidades_cierres_negocio for select to authenticated
  using ((select public.es_controlador_financiero()));

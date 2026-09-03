-- KORA v3.2: cierre de la utilidad anterior al inicio operativo del 2 de septiembre.
-- Conserva intactos los cálculos originales y registra una contrapartida auditable.
alter table public.creditos_historicos_plataforma
  add column if not exists resultado_cerrado_historico numeric(16,2) not null default 0,
  add column if not exists cierre_utilidad_at timestamptz,
  add column if not exists cierre_utilidad_motivo text;

alter table public.liquidation_operations
  add column if not exists resultado_cerrado numeric(16,2) not null default 0,
  add column if not exists cierre_utilidad_at timestamptz,
  add column if not exists cierre_utilidad_motivo text;

create table if not exists public.aliados_cierres_utilidad (
  id uuid primary key default gen_random_uuid(),
  fecha_corte timestamptz not null unique,
  motivo text not null,
  creditos_historicos integer not null,
  resultado_historico_cerrado numeric(16,2) not null,
  operaciones_liquidadas integer not null,
  resultado_operativo_cerrado numeric(16,2) not null,
  creado_at timestamptz not null default now()
);

alter table public.aliados_cierres_utilidad enable row level security;
revoke all on table public.aliados_cierres_utilidad from anon;
revoke all on table public.aliados_cierres_utilidad from authenticated;
grant select on table public.aliados_cierres_utilidad to authenticated;
grant all on table public.aliados_cierres_utilidad to service_role;

drop policy if exists aliados_cierres_utilidad_lectura on public.aliados_cierres_utilidad;
create policy aliados_cierres_utilidad_lectura
  on public.aliados_cierres_utilidad for select to authenticated
  using (
    exists (
      select 1 from public.perfiles p
       where p.id = (select auth.uid())
         and p.activo
    )
  );

do $$
declare
  v_corte constant timestamptz := timestamptz '2026-09-02 00:00:00-05';
  v_motivo constant text := 'Utilidad anterior retirada; saldo operativo inicia en cero por autorización de gerencia';
  v_h_count integer;
  v_h_total numeric(16,2);
  v_o_count integer;
  v_o_total numeric(16,2);
begin
  update public.creditos_historicos_plataforma
     set resultado_cerrado_historico = round(coalesce(utilidad_final_historica, utilidad_neta_historica, 0), 2),
         cierre_utilidad_at = now(),
         cierre_utilidad_motivo = v_motivo,
         actualizado_at = now()
   where fecha_credito < v_corte;

  update public.liquidation_operations
     set resultado_cerrado = round(coalesce(utilidad_creditek, 0), 2),
         cierre_utilidad_at = now(),
         cierre_utilidad_motivo = v_motivo
   where operation_at < v_corte;

  select count(*), round(sum(resultado_cerrado_historico), 2)
    into v_h_count, v_h_total
    from public.creditos_historicos_plataforma
   where fecha_credito < v_corte;

  select count(*), round(sum(resultado_cerrado), 2)
    into v_o_count, v_o_total
    from public.liquidation_operations
   where operation_at < v_corte;

  insert into public.aliados_cierres_utilidad (
    fecha_corte, motivo, creditos_historicos, resultado_historico_cerrado,
    operaciones_liquidadas, resultado_operativo_cerrado
  ) values (
    v_corte, v_motivo, v_h_count, coalesce(v_h_total, 0),
    v_o_count, coalesce(v_o_total, 0)
  ) on conflict (fecha_corte) do update set
    motivo = excluded.motivo,
    creditos_historicos = excluded.creditos_historicos,
    resultado_historico_cerrado = excluded.resultado_historico_cerrado,
    operaciones_liquidadas = excluded.operaciones_liquidadas,
    resultado_operativo_cerrado = excluded.resultado_operativo_cerrado;

  if exists (
    select 1 from public.creditos_historicos_plataforma
     where fecha_credito < v_corte
       and round(coalesce(utilidad_final_historica, utilidad_neta_historica, 0) - resultado_cerrado_historico, 2) <> 0
  ) or exists (
    select 1 from public.liquidation_operations
     where operation_at < v_corte
       and round(coalesce(utilidad_creditek, 0) - resultado_cerrado, 2) <> 0
  ) then
    raise exception 'El cierre no dejó en cero todos los resultados anteriores al corte';
  end if;
end $$;

comment on column public.creditos_historicos_plataforma.resultado_cerrado_historico is
  'Contrapartida del resultado anterior ya retirado o cerrado; no modifica el cálculo histórico original.';
comment on column public.liquidation_operations.resultado_cerrado is
  'Contrapartida auditable de la utilidad ya retirada antes del inicio operativo.';
comment on table public.aliados_cierres_utilidad is
  'Actas de corte que separan resultados históricos retirados de la utilidad disponible posterior.';

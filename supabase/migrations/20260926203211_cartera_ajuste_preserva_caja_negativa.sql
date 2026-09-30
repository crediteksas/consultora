-- Un ajuste exclusivo de cartera conserva el snapshot real de caja, aun
-- cuando esta tenga una inconsistencia negativa pendiente de conciliación.
-- No permite crear otro saldo negativo ni modificar caja con esta excepción.
-- No cambia RPC, permisos, saldos, solicitudes ni movimientos existentes.
begin;
set local lock_timeout = '5s';
alter table public.saldo_ajustes_auditoria
  drop constraint saldo_ajustes_auditoria_caja_objetivo_check;
alter table public.saldo_ajustes_auditoria
  add constraint saldo_ajustes_auditoria_caja_objetivo_check
  check (
    caja_objetivo >= 0
    or (caja_objetivo = caja_base and deuda_objetivo <> deuda_base)
  );
comment on constraint saldo_ajustes_auditoria_caja_objetivo_check
  on public.saldo_ajustes_auditoria is
  'Caja objetivo no negativa, salvo snapshot sin cambio en un ajuste exclusivo de cartera. No autoriza movimientos de caja negativos.';
commit;

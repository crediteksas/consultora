begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- El RPC vigente de aprobación ya usa traslado_entrada para IMEIs y accesorios.
-- Conservar todos los tipos admitidos, incluido reverso, y añadir solo este.
-- No modificar documentos, importes, permisos ni el flujo de aprobación.
do $migration$
declare
  v_predicado text;
begin
  select pg_get_expr(c.conbin, c.conrelid) into strict v_predicado
  from pg_constraint c
  where c.conrelid = 'public.movimientos'::regclass
    and c.conname = 'movimientos_tipo_check' and c.contype = 'c';
  alter table public.movimientos drop constraint movimientos_tipo_check;
  execute format(
    'alter table public.movimientos add constraint movimientos_tipo_check check ((%s) or tipo = %L)',
    v_predicado, 'traslado_entrada'
  );
end;
$migration$;
commit;

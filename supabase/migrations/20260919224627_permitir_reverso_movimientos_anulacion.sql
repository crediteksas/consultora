begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- La anulación existente registra `reverso` con reverso_de y conserva importes.
-- El CHECK introducido para ajustes lo había omitido, bloqueando el RPC entero.
-- No cambiarlo por ajuste_entrada: los cierres históricos reconocen `reverso`.
-- Conservar el predicado vigente y añadir únicamente el tipo ya utilizado por
-- las anulaciones; no cambiar RPC, permisos, RLS, saldos ni documentos aquí.
do $migration$
declare
  v_predicado text;
begin
  select pg_get_expr(c.conbin, c.conrelid)
    into strict v_predicado
  from pg_constraint c
  where c.conrelid = 'public.movimientos'::regclass
    and c.conname = 'movimientos_tipo_check'
    and c.contype = 'c';

  alter table public.movimientos drop constraint movimientos_tipo_check;
  execute format(
    'alter table public.movimientos add constraint movimientos_tipo_check check ((%s) or tipo = %L)',
    v_predicado, 'reverso'
  );
end;
$migration$;

commit;

begin;
set local lock_timeout = '5s';

-- ventas.total es numeric(14,2): su JSON representa cero como 0.00.
-- Comparar numéricamente conserva la guarda de cambios sin rechazar el mismo cero.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.caja_guardar_movimiento()'::regprocedure);
  if position($old$and to_jsonb(old)->>'total' = '0'$old$ in d) = 0 then
    raise exception 'Cambió la guarda de venta a cero; revisar antes de aplicar';
  end if;
  d := replace(d, $old$and to_jsonb(old)->>'total' = '0'$old$,
    $new$and (to_jsonb(old)->>'total')::numeric = 0$new$);
  execute d;
end $$;

commit;

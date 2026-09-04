-- Corrige la aprobación de liquidaciones: el alias SQL `o` chocaba con la
-- variable PL/pgSQL `o` al completar el valor comercial de cada orden.
do $$
declare
  v_definition text;
  v_fixed text;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'tesoreria_generar_destinos_liquidacion'
    and pg_get_function_identity_arguments(p.oid) = 'p_liquidation_id uuid';

  if v_definition is null then
    raise exception 'No existe tesoreria_generar_destinos_liquidacion(uuid)';
  end if;

  v_fixed := replace(
    v_definition,
    'select sum(o.valor_comercial) from public.payment_items pi join public.liquidation_operations o on o.id=pi.operation_id where pi.payment_order_id=po.id',
    'select sum(liq_op.valor_comercial) from public.payment_items pi join public.liquidation_operations liq_op on liq_op.id=pi.operation_id where pi.payment_order_id=po.id'
  );

  if v_fixed = v_definition then
    raise exception 'No se encontró la referencia ambigua esperada; revise la función antes de migrar';
  end if;

  execute v_fixed;
end;
$$;

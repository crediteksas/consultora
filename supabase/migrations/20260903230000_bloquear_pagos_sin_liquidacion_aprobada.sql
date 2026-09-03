-- Ninguna orden operativa puede programarse o pagarse antes de que la
-- liquidación haya sido aprobada, congelada y abonada a Tesorería.
create or replace function public.aliados_exigir_liquidacion_aprobada_para_pago()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_liquidation public.liquidations%rowtype;
begin
  if coalesce(new.historico_inicial, false) then return new; end if;
  if new.estado not in ('programado', 'pagado')
     or new.estado is not distinct from old.estado then
    return new;
  end if;

  select * into v_liquidation
  from public.liquidations
  where id = new.liquidation_id;

  if not found
     or v_liquidation.frozen_at is null
     or v_liquidation.approved_at is null then
    raise exception 'Primero Mayte debe revisar y Oscar aprobar la liquidación; después se autoriza el pago';
  end if;

  if not exists (
    select 1
    from public.liquidation_treasury_destinations d
    where d.liquidation_id = new.liquidation_id
  ) then
    raise exception 'La liquidación aprobada no generó sus saldos de Tesorería; no se puede autorizar el pago';
  end if;

  return new;
end;
$$;

drop trigger if exists payment_order_requires_approved_liquidation on public.payment_orders;
create trigger payment_order_requires_approved_liquidation
before update of estado on public.payment_orders
for each row
execute function public.aliados_exigir_liquidacion_aprobada_para_pago();

revoke all on function public.aliados_exigir_liquidacion_aprobada_para_pago()
from public, anon, authenticated;


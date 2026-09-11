begin;

-- La orden de pago ya es el libro histórico: conserva valor, fecha pagada,
-- titular, identificación, cuenta, soporte y responsables. Se añade la sede
-- comercial exacta para no depender de que el nombre del negocio cambie luego.
alter table public.payment_orders
  add column if not exists business_snapshot jsonb;

comment on column public.payment_orders.business_snapshot is
  'Negocio relacionado con la cuenta al crear o autorizar la orden: código, nombre y ciudad.';

update public.payment_orders po
set business_snapshot = jsonb_strip_nulls(jsonb_build_object(
  'code', o.codigo,
  'name', o.nombre,
  'city', o.ciudad
))
from public.liquidation_beneficiaries b
join public.origenes o on o.codigo = b.origen_codigo
where b.id = po.beneficiary_id
  and b.tipo = 'aliado'
  and po.business_snapshot is null;

create or replace function public.payment_orders_capture_business_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
  v_refresh boolean;
begin
  if tg_op = 'INSERT' then
    v_refresh := true;
  else
    v_refresh := new.beneficiary_id is distinct from old.beneficiary_id
      or (old.estado = 'pendiente' and new.estado = 'programado');
  end if;

  if tg_op = 'UPDATE'
     and not v_refresh
     and new.business_snapshot is distinct from old.business_snapshot then
    raise exception 'El negocio histórico de la orden no se puede editar';
  end if;

  if v_refresh then
    select jsonb_strip_nulls(jsonb_build_object(
      'code', o.codigo,
      'name', o.nombre,
      'city', o.ciudad
    ))
    into v_snapshot
    from public.liquidation_beneficiaries b
    left join public.origenes o on o.codigo = b.origen_codigo
    where b.id = new.beneficiary_id
      and b.tipo = 'aliado';

    new.business_snapshot := v_snapshot;
  end if;

  return new;
end;
$$;

revoke all on function public.payment_orders_capture_business_snapshot()
  from public, anon, authenticated;

drop trigger if exists payment_orders_capture_business_snapshot
  on public.payment_orders;
create trigger payment_orders_capture_business_snapshot
before insert or update of beneficiary_id, estado, business_snapshot
on public.payment_orders
for each row execute function public.payment_orders_capture_business_snapshot();

create index if not exists payment_orders_fecha_pagada_idx
  on public.payment_orders (fecha_pagada desc)
  where fecha_pagada is not null;

commit;

-- Corte operativo autorizado por Gerencia:
-- lo anterior al 1 de septiembre de 2026 ya fue pagado fuera de KORA.
-- Se conserva para auditoría, pero no genera saldo ni solicitud de soporte.

alter table public.payment_orders
  add column if not exists historico_inicial boolean not null default false,
  add column if not exists requiere_soporte boolean not null default true,
  add column if not exists fecha_inicio_operacion date not null default date '2026-09-01';

comment on column public.payment_orders.historico_inicial is
  'Pago anterior al inicio operativo de KORA; se conserva como histórico cerrado.';
comment on column public.payment_orders.requiere_soporte is
  'Solo los pagos de la operación KORA desde 2026-09-01 requieren comprobante.';
comment on column public.payment_orders.fecha_inicio_operacion is
  'Fecha de corte autorizada por Gerencia para separar histórico y operación viva.';

update public.payment_orders
set historico_inicial = true,
    requiere_soporte = false,
    estado = 'pagado',
    fecha_pagada = coalesce(
      fecha_pagada,
      make_timestamptz(
        extract(year from cutoff_snapshot)::integer,
        extract(month from cutoff_snapshot)::integer,
        extract(day from cutoff_snapshot)::integer,
        12, 0, 0, 'America/Bogota'
      )
    ),
    updated_at = now()
where cutoff_snapshot < date '2026-09-01'
  and estado in ('pendiente', 'programado');

update public.payment_orders
set historico_inicial = false,
    requiere_soporte = true,
    fecha_inicio_operacion = date '2026-09-01'
where cutoff_snapshot >= date '2026-09-01';

alter table public.payment_orders
  drop constraint if exists payment_orders_historico_soporte_check;
alter table public.payment_orders
  add constraint payment_orders_historico_soporte_check
  check (not historico_inicial or not requiere_soporte);

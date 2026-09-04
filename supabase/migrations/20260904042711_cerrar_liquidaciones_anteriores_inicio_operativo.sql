-- Corte confirmado por Gerencia: todo pago y liquidación anterior al
-- 1 de septiembre de 2026 pertenece al histórico inicial ya pagado.
update public.payment_orders po
set historico_inicial = true,
    requiere_soporte = false,
    estado = 'pagado',
    fecha_pagada = coalesce(
      po.fecha_pagada,
      make_timestamptz(
        extract(year from po.cutoff_snapshot)::integer,
        extract(month from po.cutoff_snapshot)::integer,
        extract(day from po.cutoff_snapshot)::integer,
        12, 0, 0, 'America/Bogota'
      )
    ),
    updated_at = now()
where po.cutoff_snapshot < date '2026-09-01'
  and (
    not po.historico_inicial
    or po.requiere_soporte
    or po.estado <> 'pagado'
  );

update public.liquidations l
set estado = 'cerrada',
    frozen_at = coalesce(l.frozen_at, now()),
    updated_at = now()
where l.fecha_corte < date '2026-09-01'
  and l.estado <> 'cerrada';

insert into public.audit_log(usuario, accion, tabla, registro_id, detalle)
select null,
       'liquidacion_historica_cerrada_por_corte',
       'liquidations',
       l.id::text,
       jsonb_build_object(
         'fecha_corte', l.fecha_corte,
         'fecha_inicio_operativo', date '2026-09-01',
         'motivo', 'Cierre de operación pagada antes del inicio de KORA'
       )
from public.liquidations l
where l.fecha_corte < date '2026-09-01';

create or replace function public.clasificar_pago_historico_por_corte()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.cutoff_snapshot < date '2026-09-01' then
    new.historico_inicial := true;
    new.requiere_soporte := false;
    new.estado := 'pagado';
    new.fecha_pagada := coalesce(
      new.fecha_pagada,
      make_timestamptz(
        extract(year from new.cutoff_snapshot)::integer,
        extract(month from new.cutoff_snapshot)::integer,
        extract(day from new.cutoff_snapshot)::integer,
        12, 0, 0, 'America/Bogota'
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists payment_order_classify_historical_cutoff
  on public.payment_orders;
create trigger payment_order_classify_historical_cutoff
before insert or update of cutoff_snapshot, estado, historico_inicial, requiere_soporte
on public.payment_orders
for each row execute function public.clasificar_pago_historico_por_corte();

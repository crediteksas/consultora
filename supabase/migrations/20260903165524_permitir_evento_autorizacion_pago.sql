alter table public.liquidation_domain_events
  drop constraint if exists liquidation_domain_events_event_type_check;

alter table public.liquidation_domain_events
  add constraint liquidation_domain_events_event_type_check
  check (event_type = any (array[
    'liquidation.imported'::text,
    'liquidation.validated'::text,
    'liquidation.has_incidents'::text,
    'liquidation.calculated'::text,
    'liquidation.reviewed'::text,
    'liquidation.approved'::text,
    'payment.scheduled'::text,
    'payment.authorized'::text,
    'payment.completed'::text,
    'payment.rejected'::text,
    'liquidation.closed'::text,
    'treasury.ally_payment_completed'::text,
    'treasury.executive_payment_completed'::text,
    'treasury.compensation_created'::text,
    'treasury.movement_completed'::text
  ]));

comment on constraint liquidation_domain_events_event_type_check
  on public.liquidation_domain_events is
  'Eventos permitidos del ciclo de liquidación, incluida la autorización expresa de Gerencia.';

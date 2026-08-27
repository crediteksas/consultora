begin;

-- aura_sofia_outbox nació para respuestas de Meta y luego recibió columnas
-- de evidencia comercial. Los handoffs no tienen un meta_event_id entrante,
-- conversation_id ni payload de respuesta, por lo que esas columnas deben
-- ser opcionales para el nuevo event_kind.
alter table public.aura_sofia_outbox
  alter column meta_event_id drop not null,
  alter column conversation_id drop not null,
  alter column channel drop not null,
  alter column payload drop not null;

alter table public.aura_sofia_outbox
  drop constraint if exists aura_sofia_outbox_status_check;

alter table public.aura_sofia_outbox
  add constraint aura_sofia_outbox_status_check
  check (status = any (array['pending'::text, 'reserved'::text, 'sent'::text, 'error'::text, 'manual_review'::text]));

commit;

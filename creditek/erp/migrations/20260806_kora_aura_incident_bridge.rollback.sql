begin;

drop function if exists public.kora_attach_incident_evidence_from_aura(
  uuid, text, text, text, text, bigint
);
drop function if exists public.kora_create_incident_from_aura(
  jsonb, uuid, text
);

commit;

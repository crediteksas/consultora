begin;
drop function if exists public.kora_attach_incident_evidence_bridge_v1(uuid, text, text, text, text, bigint);
drop function if exists public.kora_create_incident_bridge_v1(jsonb, uuid, text);
commit;

-- Rollback protegido de KORA Incident Center v1.0.0.
-- Requiere respaldo y se niega a borrar información registrada.

begin;

do $$
begin
  if to_regclass('public.kora_incidents') is not null
     and exists (select 1 from public.kora_incidents) then
    raise exception 'Rollback detenido: existen incidencias. Crea y verifica un respaldo antes de continuar';
  end if;
  if exists (
    select 1
    from storage.objects
    where bucket_id = 'kora-incident-evidence'
  ) then
    raise exception 'Rollback detenido: existen evidencias. Crea y verifica un respaldo antes de continuar';
  end if;
end;
$$;

drop policy if exists kora_incident_evidence_select_authorized on storage.objects;
drop policy if exists kora_incident_evidence_insert_own on storage.objects;
delete from storage.buckets where id = 'kora-incident-evidence';

drop function if exists public.kora_incident_metrics(timestamptz, timestamptz);
drop function if exists public.kora_find_similar_incidents(text, text, text, text, text);
drop function if exists public.kora_confirm_incident_resolved(uuid);
drop function if exists public.kora_update_incident(uuid, text, text, uuid, text, text);
drop function if exists public.kora_add_incident_comment(uuid, text, boolean);
drop function if exists public.kora_attach_incident_evidence(uuid, text, text, text, bigint);
drop function if exists public.kora_create_incident(jsonb, uuid);
drop function if exists public.kora_next_incident_code();
drop function if exists public.kora_incident_can_view(public.kora_incidents);
drop function if exists public.kora_incident_has_permission(text);
drop function if exists public.kora_sanitize_incident_text(text, integer);
drop function if exists public.kora_redact_incident_text(text);

drop table if exists public.kora_incident_notifications;
drop table if exists public.kora_incident_comments;
drop table if exists public.kora_incident_history;
drop table if exists public.kora_incidents;
drop table if exists public.kora_incident_permissions;
drop table if exists public.kora_incident_sequences;

commit;

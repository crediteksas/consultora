-- Rollback KORA Incident Center v1.1.0
-- Ejecutar únicamente si se revierte también el frontend a la versión anterior.

begin;

drop trigger if exists kora_incident_comments_notify on public.kora_incident_comments;
drop function if exists public.kora_incident_comment_notification();
drop function if exists public.kora_request_incident_information(uuid, text, uuid);
drop function if exists public.kora_manage_incident_v1_1(uuid, text, text, uuid, text, text, uuid);
create or replace function public.kora_incident_audit_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    insert into public.kora_incident_history (
      incident_id, event_type, previous_value, new_value, responsible_user_id
    )
    values (
      new.id,
      'status_changed',
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status),
      auth.uid()
    );
    insert into public.kora_incident_notifications (
      incident_id, event_type, recipient_kind, priority, payload
    )
    values (
      new.id,
      'status_changed',
      'reporter',
      'normal',
      jsonb_build_object(
        'incident_code', new.incident_code,
        'status', new.status,
        'internal_path', '/creditek/erp/mis-reportes.html?id=' || new.id::text
      )
    );
  end if;
  if new.priority is distinct from old.priority then
    insert into public.kora_incident_history (
      incident_id, event_type, previous_value, new_value, responsible_user_id
    )
    values (
      new.id,
      'priority_changed',
      jsonb_build_object('priority', old.priority),
      jsonb_build_object('priority', new.priority),
      auth.uid()
    );
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.kora_incident_history (
      incident_id, event_type, previous_value, new_value, responsible_user_id
    )
    values (
      new.id,
      'assignment_changed',
      jsonb_build_object('assigned_to', old.assigned_to),
      jsonb_build_object('assigned_to', new.assigned_to),
      auth.uid()
    );
  end if;
  return new;
end;
$$;

drop function if exists public.kora_notify_incident_user(uuid, text, text, text, uuid, jsonb, text);
drop function if exists public.kora_incident_user_name(uuid);

do $$
begin
  if to_regclass('public.kora_notifications') is not null
     and not exists (select 1 from public.kora_notifications limit 1) then
    execute 'drop table if exists public.kora_notifications';
  elsif to_regclass('public.kora_notifications') is not null then
    revoke all on public.kora_notifications from public, anon, authenticated;
  end if;
end;
$$;

drop table if exists public.kora_incident_operations;

-- resolved_at y una tabla con notificaciones ya emitidas se conservan si contienen
-- evidencia histórica. El frontend anterior simplemente no las consulta.

commit;

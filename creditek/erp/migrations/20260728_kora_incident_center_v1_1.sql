-- KORA Incident Center v1.1.0
-- Cierre idempotente y notificaciones internas privadas.
-- Migración aditiva: no modifica datos financieros ni elimina objetos existentes.

begin;

do $$
begin
  if to_regclass('public.kora_incidents') is null
     or to_regclass('public.kora_incident_history') is null
     or to_regclass('public.kora_incident_comments') is null
     or to_regclass('public.perfiles') is null then
    raise exception 'KORA Incident Center v1.1.0 requiere la versión 1.0.0 instalada';
  end if;
end;
$$;

alter table public.kora_incidents
  add column if not exists resolved_at timestamptz;

create table if not exists public.kora_incident_operations (
  request_id uuid primary key,
  incident_id uuid not null references public.kora_incidents(id) on delete cascade,
  actor_user_id uuid not null,
  result jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.kora_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null check (type in (
    'incident_assigned',
    'incident_in_review',
    'incident_comment',
    'incident_information_requested',
    'incident_resolved'
  )),
  title text not null,
  message text not null,
  incident_id uuid references public.kora_incidents(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  deduplication_key text not null unique
);

create index if not exists kora_notifications_user_unread_idx
  on public.kora_notifications (user_id, created_at desc)
  where read_at is null;

alter table public.kora_incident_operations enable row level security;
alter table public.kora_notifications enable row level security;

drop policy if exists kora_notifications_select_own on public.kora_notifications;
create policy kora_notifications_select_own
on public.kora_notifications
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists kora_notifications_update_own on public.kora_notifications;
create policy kora_notifications_update_own
on public.kora_notifications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke all on public.kora_incident_operations from public, anon, authenticated;
revoke all on public.kora_notifications from public, anon, authenticated;
grant select on public.kora_notifications to authenticated;
grant update (read_at) on public.kora_notifications to authenticated;

create or replace function public.kora_incident_user_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(trim((select p.nombre from public.perfiles p where p.id = p_user_id)), ''),
    'Usuario sin nombre'
  );
$$;

create or replace function public.kora_notify_incident_user(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_incident_id uuid,
  p_metadata jsonb,
  p_deduplication_key text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null or nullif(trim(p_deduplication_key), '') is null then
    return;
  end if;

  insert into public.kora_notifications (
    user_id, type, title, message, incident_id, metadata, deduplication_key
  )
  values (
    p_user_id,
    p_type,
    public.kora_sanitize_incident_text(p_title, 180),
    public.kora_sanitize_incident_text(p_message, 1000),
    p_incident_id,
    coalesce(p_metadata, '{}'::jsonb),
    p_deduplication_key
  )
  on conflict (deduplication_key) do nothing;
end;
$$;

create or replace function public.kora_manage_incident_v1_1(
  p_incident_id uuid,
  p_status text default null,
  p_priority text default null,
  p_assigned_to uuid default null,
  p_resolution_summary text default null,
  p_fixed_version text default null,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_incident public.kora_incidents%rowtype;
  v_status text;
  v_priority text;
  v_resolution text;
  v_fixed_version text;
  v_result jsonb;
begin
  if p_request_id is null then
    raise exception 'El identificador de la solicitud es obligatorio';
  end if;

  insert into public.kora_incident_operations (
    request_id, incident_id, actor_user_id
  )
  values (p_request_id, p_incident_id, auth.uid())
  on conflict (request_id) do nothing;

  if not found then
    select operation.result
    into v_result
    from public.kora_incident_operations operation
    where operation.request_id = p_request_id
      and operation.actor_user_id = auth.uid();

    if v_result is null then
      raise exception 'La solicitud ya fue procesada por otro usuario';
    end if;
    return v_result;
  end if;

  select *
  into v_incident
  from public.kora_incidents
  where id = p_incident_id
  for update;

  if not found or not public.kora_incident_has_permission('incident_admin') then
    raise exception 'No autorizado para administrar incidencias';
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), v_incident.status);
  v_priority := coalesce(nullif(trim(p_priority), ''), v_incident.priority);
  v_resolution := nullif(public.kora_sanitize_incident_text(p_resolution_summary, 4000), '');
  v_fixed_version := nullif(public.kora_sanitize_incident_text(p_fixed_version, 120), '');

  if v_status not in (
    'nuevo', 'en_revision', 'confirmado', 'en_desarrollo', 'corregido',
    'pendiente_validacion', 'cerrado', 'rechazado', 'no_reproducible', 'duplicado'
  ) then
    raise exception 'Estado no válido';
  end if;
  if v_priority not in ('baja', 'media', 'alta', 'critica') then
    raise exception 'Prioridad no válida';
  end if;
  if v_priority <> v_incident.priority
     and not public.kora_incident_has_permission('incident_change_priority') then
    raise exception 'No autorizado para cambiar prioridad';
  end if;
  if v_status <> v_incident.status
     and not public.kora_incident_has_permission('incident_change_status') then
    raise exception 'No autorizado para cambiar estado';
  end if;
  if p_assigned_to is distinct from v_incident.assigned_to
     and not public.kora_incident_has_permission('incident_assign') then
    raise exception 'No autorizado para asignar incidencias';
  end if;
  if v_status = 'corregido'
     and (v_resolution is null or v_fixed_version is null) then
    raise exception 'Para resolver debes indicar la resolución y la versión corregida';
  end if;
  if v_incident.status = 'cerrado' and v_status <> 'cerrado' then
    raise exception 'Una incidencia cerrada no puede reabrirse desde esta operación';
  end if;

  update public.kora_incidents
  set status = v_status,
      priority = v_priority,
      assigned_to = p_assigned_to,
      resolution_summary = case
        when v_status = 'corregido' then v_resolution
        else coalesce(v_resolution, resolution_summary)
      end,
      fixed_version = case
        when v_status = 'corregido' then v_fixed_version
        else coalesce(v_fixed_version, fixed_version)
      end,
      resolved_at = case
        when v_status = 'corregido' then coalesce(resolved_at, now())
        else resolved_at
      end,
      updated_at = now(),
      closed_at = case when v_status = 'cerrado' then coalesce(closed_at, now()) else closed_at end
  where id = p_incident_id
  returning * into v_incident;

  v_result := jsonb_build_object(
    'ok', true,
    'id', v_incident.id,
    'status', v_incident.status,
    'priority', v_incident.priority,
    'resolved_at', v_incident.resolved_at
  );

  update public.kora_incident_operations
  set result = v_result
  where request_id = p_request_id;

  return v_result;
end;
$$;

create or replace function public.kora_request_incident_information(
  p_incident_id uuid,
  p_body text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_incident public.kora_incidents%rowtype;
  v_profile public.perfiles%rowtype;
  v_body text;
  v_result jsonb;
begin
  if p_request_id is null then
    raise exception 'El identificador de la solicitud es obligatorio';
  end if;

  insert into public.kora_incident_operations (request_id, incident_id, actor_user_id)
  values (p_request_id, p_incident_id, auth.uid())
  on conflict (request_id) do nothing;

  if not found then
    select result into v_result
    from public.kora_incident_operations
    where request_id = p_request_id and actor_user_id = auth.uid();
    if v_result is null then
      raise exception 'La solicitud ya fue procesada por otro usuario';
    end if;
    return v_result;
  end if;

  if not public.kora_incident_has_permission('incident_admin') then
    raise exception 'No autorizado para solicitar información';
  end if;

  select * into v_incident from public.kora_incidents where id = p_incident_id for update;
  select * into v_profile from public.perfiles where id = auth.uid() and activo = true;
  v_body := public.kora_sanitize_incident_text(p_body, 3000);
  if v_incident.id is null or char_length(v_body) < 1 then
    raise exception 'Escribe la información que necesitas solicitar';
  end if;

  insert into public.kora_incident_comments (
    incident_id, author_user_id, author_name_snapshot, author_role_snapshot, body, is_internal
  )
  values (
    v_incident.id, auth.uid(), v_profile.nombre, v_profile.rol, v_body, false
  );

  insert into public.kora_incident_history (
    incident_id, event_type, new_value, comment, responsible_user_id
  )
  values (
    v_incident.id,
    'information_requested',
    jsonb_build_object('requested', true),
    v_body,
    auth.uid()
  );

  perform public.kora_notify_incident_user(
    v_incident.user_id,
    'incident_information_requested',
    'Información adicional requerida',
    'Necesitamos información adicional para continuar con ' || v_incident.incident_code || '.',
    v_incident.id,
    jsonb_build_object(
      'incident_code', v_incident.incident_code,
      'internal_path', '/creditek/erp/mis-reportes.html?id=' || v_incident.id::text
    ),
    'information:' || p_request_id::text
  );

  v_result := jsonb_build_object('ok', true, 'id', v_incident.id);
  update public.kora_incident_operations set result = v_result where request_id = p_request_id;
  return v_result;
end;
$$;

create or replace function public.kora_incident_audit_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_responsible_name text;
begin
  new.updated_at := now();
  v_responsible_name := public.kora_incident_user_name(new.assigned_to);

  if new.status is distinct from old.status then
    insert into public.kora_incident_history (
      incident_id, event_type, previous_value, new_value, responsible_user_id
    )
    values (
      new.id,
      'status_changed',
      jsonb_build_object('status', old.status),
      jsonb_build_object(
        'status', new.status,
        'fixed_version', new.fixed_version,
        'resolution_summary', new.resolution_summary
      ),
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

    if new.status = 'en_revision' then
      perform public.kora_notify_incident_user(
        new.user_id,
        'incident_in_review',
        'Incidencia en revisión',
        'Tu incidencia ' || new.incident_code || ' está en revisión.',
        new.id,
        jsonb_build_object(
          'incident_code', new.incident_code,
          'internal_path', '/creditek/erp/mis-reportes.html?id=' || new.id::text
        ),
        'status:' || new.id::text || ':en_revision'
      );
    elsif new.status = 'corregido' then
      perform public.kora_notify_incident_user(
        new.user_id,
        'incident_resolved',
        'Tu incidencia fue resuelta',
        'Tu incidencia ' || new.incident_code || ' fue resuelta.',
        new.id,
        jsonb_build_object(
          'incident_code', new.incident_code,
          'incident_title', new.title,
          'resolution', new.resolution_summary,
          'fixed_version', new.fixed_version,
          'responsible', v_responsible_name,
          'resolved_at', new.resolved_at,
          'internal_path', '/creditek/erp/mis-reportes.html?id=' || new.id::text
        ),
        'status:' || new.id::text || ':corregido'
      );
    end if;
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

    perform public.kora_notify_incident_user(
      new.assigned_to,
      'incident_assigned',
      'Incidencia asignada',
      'Se te asignó la incidencia ' || new.incident_code || ': ' || new.title,
      new.id,
      jsonb_build_object(
        'incident_code', new.incident_code,
        'internal_path', '/creditek/erp/incidencias.html?id=' || new.id::text
      ),
      'assignment:' || new.id::text || ':' || new.assigned_to::text
    );
  end if;

  return new;
end;
$$;

create or replace function public.kora_incident_comment_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_incident public.kora_incidents%rowtype;
begin
  select * into v_incident from public.kora_incidents where id = new.incident_id;
  if v_incident.id is not null and new.author_user_id <> v_incident.user_id and not new.is_internal then
    perform public.kora_notify_incident_user(
      v_incident.user_id,
      'incident_comment',
      'Nueva respuesta en tu incidencia',
      'Hay una nueva respuesta en ' || v_incident.incident_code || '.',
      v_incident.id,
      jsonb_build_object(
        'incident_code', v_incident.incident_code,
        'internal_path', '/creditek/erp/mis-reportes.html?id=' || v_incident.id::text
      ),
      'comment:' || new.id::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists kora_incident_comments_notify on public.kora_incident_comments;
create trigger kora_incident_comments_notify
after insert on public.kora_incident_comments
for each row execute function public.kora_incident_comment_notification();

revoke all on function public.kora_incident_user_name(uuid) from public, anon, authenticated;
revoke all on function public.kora_notify_incident_user(uuid, text, text, text, uuid, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.kora_incident_comment_notification()
  from public, anon, authenticated;
revoke all on function public.kora_manage_incident_v1_1(uuid, text, text, uuid, text, text, uuid)
  from public, anon;
grant execute on function public.kora_manage_incident_v1_1(uuid, text, text, uuid, text, text, uuid)
  to authenticated;
revoke all on function public.kora_request_incident_information(uuid, text, uuid)
  from public, anon;
grant execute on function public.kora_request_incident_information(uuid, text, uuid)
  to authenticated;

commit;

begin;

do $preflight$
begin
  if not exists (
    select 1 from pg_class
    where oid = 'public.kora_incidents'::regclass
      and relrowsecurity
  ) then
    raise exception 'RLS debe permanecer activo en kora_incidents';
  end if;
  if has_table_privilege('authenticated', 'public.kora_incidents', 'UPDATE') then
    raise exception 'authenticated no debe actualizar kora_incidents directamente';
  end if;
end;
$preflight$;

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
  v_transition_allowed boolean;
  v_result jsonb;
begin
  if p_request_id is null then
    raise exception 'El identificador de la solicitud es obligatorio';
  end if;

  insert into public.kora_incident_operations (request_id, incident_id, actor_user_id)
  values (p_request_id, p_incident_id, auth.uid())
  on conflict (request_id) do nothing;

  if not found then
    select operation.result into v_result
    from public.kora_incident_operations operation
    where operation.request_id = p_request_id
      and operation.actor_user_id = auth.uid();
    if v_result is null then
      raise exception 'La solicitud ya fue procesada por otro usuario';
    end if;
    return v_result;
  end if;

  select * into v_incident
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

  v_transition_allowed := v_status = v_incident.status
    or (v_incident.status = 'nuevo' and v_status in ('en_revision', 'rechazado', 'duplicado'))
    or (v_incident.status = 'en_revision' and v_status in ('confirmado', 'no_reproducible', 'rechazado', 'duplicado'))
    or (v_incident.status = 'confirmado' and v_status in ('en_desarrollo', 'rechazado', 'duplicado'))
    or (v_incident.status = 'en_desarrollo' and v_status in ('corregido', 'no_reproducible'))
    or (v_incident.status = 'corregido' and v_status in ('pendiente_validacion', 'cerrado', 'en_desarrollo'))
    or (v_incident.status = 'pendiente_validacion' and v_status in ('cerrado', 'en_desarrollo'))
    or (v_incident.status = 'no_reproducible' and v_status = 'en_revision')
    or (v_incident.status = 'duplicado' and v_status = 'en_revision');

  if not v_transition_allowed then
    raise exception 'Transición de estado no permitida: % a %', v_incident.status, v_status;
  end if;
  if v_priority <> v_incident.priority
     and not public.kora_incident_has_permission('incident_change_priority') then
    raise exception 'No autorizado para cambiar prioridad';
  end if;
  if v_status <> v_incident.status
     and not public.kora_incident_has_permission('incident_change_status') then
    raise exception 'No autorizado para cambiar estado';
  end if;
  if v_status = 'cerrado'
     and not public.kora_incident_has_permission('incident_close') then
    raise exception 'No autorizado para cerrar incidencias';
  end if;
  if p_assigned_to is distinct from v_incident.assigned_to
     and not public.kora_incident_has_permission('incident_assign') then
    raise exception 'No autorizado para asignar incidencias';
  end if;
  if v_status = 'corregido'
     and (v_resolution is null or v_fixed_version is null) then
    raise exception 'Para resolver debes indicar la resolución y la versión corregida';
  end if;
  if v_status = 'cerrado'
     and coalesce(v_resolution, v_incident.resolution_summary) is null then
    raise exception 'Para cerrar debes conservar la resolución';
  end if;

  update public.kora_incidents
  set status = v_status,
      priority = v_priority,
      assigned_to = p_assigned_to,
      resolution_summary = coalesce(v_resolution, resolution_summary),
      fixed_version = coalesce(v_fixed_version, fixed_version),
      resolved_at = case
        when v_status = 'corregido' then coalesce(resolved_at, now())
        else resolved_at
      end,
      updated_at = now(),
      closed_at = case
        when v_status = 'cerrado' then coalesce(closed_at, now())
        else closed_at
      end
  where id = p_incident_id
  returning * into v_incident;

  v_result := jsonb_build_object(
    'ok', true,
    'id', v_incident.id,
    'status', v_incident.status,
    'priority', v_incident.priority,
    'resolved_at', v_incident.resolved_at,
    'closed_at', v_incident.closed_at
  );

  update public.kora_incident_operations
  set result = v_result
  where request_id = p_request_id;

  return v_result;
end;
$$;

revoke all on function public.kora_manage_incident_v1_1(uuid, text, text, uuid, text, text, uuid)
  from public, anon;
grant execute on function public.kora_manage_incident_v1_1(uuid, text, text, uuid, text, text, uuid)
  to authenticated;

commit;

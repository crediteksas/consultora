begin;

do $preflight$
begin
  if to_regclass('public.perfiles') is null
     or to_regclass('public.kora_incident_permissions') is null
     or to_regclass('public.kora_incidents') is null
     or to_regclass('public.kora_incident_comments') is null then
    raise exception 'Faltan tablas requeridas para ajustar permisos de incidencias';
  end if;
end;
$preflight$;

delete from public.kora_incident_permissions
where role_name in ('asesor', 'admin_tienda', 'auditoria', 'gerencia', 'soporte');

insert into public.kora_incident_permissions (role_name, permission_name)
values
  ('asesor', 'incident_create'),
  ('asesor', 'incident_view_own'),
  ('asesor', 'incident_view_store'),
  ('asesor', 'incident_comment'),
  ('admin_tienda', 'incident_create'),
  ('admin_tienda', 'incident_view_own'),
  ('admin_tienda', 'incident_view_store'),
  ('admin_tienda', 'incident_comment'),
  ('auditoria', 'incident_create'),
  ('auditoria', 'incident_view_all'),
  ('soporte', 'incident_create'),
  ('soporte', 'incident_view_all'),
  ('soporte', 'incident_comment'),
  ('gerencia', 'incident_create'),
  ('gerencia', 'incident_view_own'),
  ('gerencia', 'incident_view_store'),
  ('gerencia', 'incident_view_all'),
  ('gerencia', 'incident_comment'),
  ('gerencia', 'incident_assign'),
  ('gerencia', 'incident_change_priority'),
  ('gerencia', 'incident_change_status'),
  ('gerencia', 'incident_close'),
  ('gerencia', 'incident_admin'),
  ('gerencia', 'incident_generate_task');

create or replace function public.kora_confirm_incident_resolved(
  p_incident_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_incident public.kora_incidents%rowtype;
begin
  select * into v_incident
  from public.kora_incidents
  where id = p_incident_id
  for update;

  if not found
     or not public.kora_incident_can_view(v_incident)
     or not public.kora_incident_has_permission('incident_close') then
    raise exception 'No autorizado para cerrar incidencias';
  end if;
  if v_incident.status not in ('corregido', 'pendiente_validacion') then
    raise exception 'La incidencia aún no está lista para cerrar';
  end if;

  update public.kora_incidents
  set status = 'cerrado',
      updated_at = now(),
      closed_at = now()
  where id = p_incident_id;

  return jsonb_build_object('ok', true, 'status', 'cerrado');
end;
$$;

drop policy if exists kora_incident_evidence_insert_own on storage.objects;
create policy kora_incident_evidence_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'kora-incident-evidence'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|pdf)$'
  and exists (
    select 1
    from public.kora_incidents i
    where i.id = (storage.foldername(name))[1]::uuid
      and public.kora_incident_can_view(i)
      and public.kora_incident_has_permission('incident_comment')
  )
);

revoke all on function public.kora_confirm_incident_resolved(uuid)
  from public, anon;
grant execute on function public.kora_confirm_incident_resolved(uuid)
  to authenticated;

commit;

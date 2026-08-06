-- Puente aditivo AURA -> Centro Corporativo de Incidencias KORA.
-- Rollback: drop function public.kora_attach_incident_evidence_from_aura(...);
--           drop function public.kora_create_incident_from_aura(jsonb, uuid, text);

begin;

create or replace function public.kora_create_incident_from_aura(
  p_payload jsonb,
  p_local_incident_id uuid,
  p_aura_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_profile public.perfiles%rowtype;
  v_existing public.kora_incidents%rowtype;
  v_incident public.kora_incidents%rowtype;
  v_console_errors jsonb;
  v_title text;
  v_description text;
  v_attempted text;
  v_priority text;
begin
  select p.* into v_profile
  from auth.users u
  join public.perfiles p on p.id = u.id
  join public.kora_incident_permissions permission
    on permission.role_name = p.rol and permission.permission_name = 'incident_create'
  where lower(u.email) = lower(public.kora_sanitize_incident_text(p_aura_email, 320))
    and p.activo = true;

  if not found then raise exception 'Perfil KORA corporativo no encontrado o sin permiso'; end if;
  if p_local_incident_id is null or p_payload is null then raise exception 'Datos obligatorios ausentes'; end if;

  select * into v_existing
  from public.kora_incidents
  where local_incident_id = p_local_incident_id and user_id = v_profile.id;
  if found then
    return jsonb_build_object('ok', true, 'reused', true, 'id', v_existing.id, 'incident_code', v_existing.incident_code);
  end if;

  if (select count(*) from public.kora_incidents where user_id = v_profile.id and created_at >= now() - interval '1 hour') >= 10 then
    raise exception 'Límite de reportes excedido; intenta nuevamente más tarde';
  end if;

  v_title := public.kora_redact_incident_text(public.kora_sanitize_incident_text(p_payload->>'title', 160));
  v_description := public.kora_redact_incident_text(public.kora_sanitize_incident_text(p_payload->>'description', 5000));
  v_attempted := public.kora_redact_incident_text(public.kora_sanitize_incident_text(p_payload->>'attempted_action', 2000));
  v_priority := lower(public.kora_sanitize_incident_text(p_payload->>'priority', 20));
  if char_length(v_title) < 5 or char_length(v_description) < 10 or char_length(v_attempted) < 5
     or v_priority not in ('baja','media','alta','critica') then
    raise exception 'Los datos de la incidencia no son válidos';
  end if;

  select coalesce(jsonb_agg(public.kora_redact_incident_text(public.kora_sanitize_incident_text(item, 500))), '[]'::jsonb)
  into v_console_errors
  from jsonb_array_elements_text(case when jsonb_typeof(p_payload->'console_errors') = 'array' then p_payload->'console_errors' else '[]'::jsonb end) item;

  insert into public.kora_incidents (
    local_incident_id, incident_code, title, description, attempted_action, additional_information,
    priority, module, page_name, page_url, user_id, user_name_snapshot, role_snapshot,
    store_code, store_name_snapshot, kora_version, deployment_version, browser, operating_system,
    screen_resolution, viewport, connection_status, session_identifier, technical_context, console_errors
  ) values (
    p_local_incident_id, public.kora_next_incident_code(), v_title, v_description, v_attempted,
    public.kora_redact_incident_text(public.kora_sanitize_incident_text(coalesce(p_payload->>'additional_information','Origen corporativo: AURA'), 3000)),
    v_priority, 'AURA · ' || public.kora_sanitize_incident_text(p_payload->>'module', 110),
    public.kora_sanitize_incident_text(p_payload->>'page_name', 160),
    public.kora_sanitize_incident_text(p_payload->>'page_url', 1000),
    v_profile.id, public.kora_sanitize_incident_text(v_profile.nombre, 200),
    public.kora_sanitize_incident_text(v_profile.rol, 80), v_profile.tienda_codigo,
    coalesce(nullif(public.kora_sanitize_incident_text(v_profile.tienda_codigo, 120), ''), 'Corporativo'),
    coalesce(nullif(public.kora_sanitize_incident_text(p_payload->>'kora_version', 80), ''), 'AURA'),
    nullif(public.kora_sanitize_incident_text(p_payload->>'deployment_version', 120), ''),
    nullif(public.kora_sanitize_incident_text(p_payload->>'browser', 160), ''),
    nullif(public.kora_sanitize_incident_text(p_payload->>'operating_system', 160), ''),
    nullif(public.kora_sanitize_incident_text(p_payload->>'screen_resolution', 80), ''),
    nullif(public.kora_sanitize_incident_text(p_payload->>'viewport', 80), ''),
    nullif(public.kora_sanitize_incident_text(p_payload->>'connection_status', 40), ''),
    nullif(public.kora_sanitize_incident_text(p_payload->>'session_identifier', 100), ''),
    jsonb_build_object(
      'source_system', 'aura',
      'incident_type', public.kora_sanitize_incident_text(coalesce(p_payload->>'incident_type','error'), 40),
      'browser', public.kora_redact_incident_text(public.kora_sanitize_incident_text(p_payload->>'browser', 160)),
      'viewport', public.kora_sanitize_incident_text(p_payload->>'viewport', 80)
    ),
    v_console_errors
  ) returning * into v_incident;

  insert into public.kora_incident_history (incident_id, event_type, new_value, responsible_user_id)
  values (v_incident.id, 'created', jsonb_build_object('status', v_incident.status, 'priority', v_incident.priority, 'source_system', 'aura'), v_profile.id);

  insert into public.kora_incident_notifications (incident_id, event_type, recipient_kind, priority, payload)
  values (v_incident.id, 'created', 'support', case when v_priority='critica' then 'urgent' else 'normal' end,
    jsonb_build_object('incident_code',v_incident.incident_code,'priority',v_priority,'module',v_incident.module,'title',v_incident.title,'source_system','aura','internal_path','/creditek/erp/incidencias.html?id='||v_incident.id::text));

  return jsonb_build_object('ok',true,'reused',false,'id',v_incident.id,'incident_code',v_incident.incident_code);
end;
$$;

create or replace function public.kora_attach_incident_evidence_from_aura(
  p_incident_id uuid,
  p_aura_email text,
  p_path text,
  p_name text,
  p_mime text,
  p_size bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare v_profile_id uuid;
begin
  select p.id into v_profile_id from auth.users u join public.perfiles p on p.id=u.id
  where lower(u.email)=lower(public.kora_sanitize_incident_text(p_aura_email,320)) and p.activo=true;
  if not found or not exists(select 1 from public.kora_incidents i where i.id=p_incident_id and i.user_id=v_profile_id) then
    raise exception 'Incidencia AURA no autorizada';
  end if;
  if p_path !~ ('^'||p_incident_id::text||'/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|pdf)$')
     or p_mime not in ('image/png','image/jpeg','image/webp','application/pdf')
     or p_size is null or p_size<1 or p_size>10485760 then raise exception 'La evidencia no es válida'; end if;
  update public.kora_incidents set evidence_path=p_path, evidence_name=public.kora_sanitize_incident_text(p_name,240),
    evidence_mime=p_mime, evidence_size=p_size, updated_at=now() where id=p_incident_id;
  insert into public.kora_incident_history(incident_id,event_type,new_value,responsible_user_id)
  values(p_incident_id,'evidence_added',jsonb_build_object('mime',p_mime,'size',p_size,'source_system','aura'),v_profile_id);
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.kora_create_incident_from_aura(jsonb,uuid,text) from public, anon, authenticated;
grant execute on function public.kora_create_incident_from_aura(jsonb,uuid,text) to service_role;
revoke all on function public.kora_attach_incident_evidence_from_aura(uuid,text,text,text,text,bigint) from public, anon, authenticated;
grant execute on function public.kora_attach_incident_evidence_from_aura(uuid,text,text,text,text,bigint) to service_role;

commit;

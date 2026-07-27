-- KORA Incident Center v1.0.0
-- Migración aditiva. No modifica tablas financieras ni datos operativos existentes.

begin;

do $$
begin
  if to_regclass('public.perfiles') is null
     or to_regclass('public.origenes') is null then
    raise exception 'Incident Center requiere public.perfiles y public.origenes';
  end if;
end;
$$;

create table if not exists public.kora_incident_sequences (
  sequence_year integer primary key,
  next_value bigint not null check (next_value > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.kora_incident_permissions (
  role_name text not null,
  permission_name text not null,
  created_at timestamptz not null default now(),
  primary key (role_name, permission_name)
);

create table if not exists public.kora_incidents (
  id uuid primary key default gen_random_uuid(),
  local_incident_id uuid not null unique,
  incident_code text not null unique,
  title text not null check (char_length(title) between 5 and 160),
  description text not null check (char_length(description) between 10 and 5000),
  attempted_action text not null check (char_length(attempted_action) between 5 and 2000),
  additional_information text,
  priority text not null default 'media'
    check (priority in ('baja', 'media', 'alta', 'critica')),
  status text not null default 'nuevo'
    check (status in (
      'nuevo',
      'en_revision',
      'confirmado',
      'en_desarrollo',
      'corregido',
      'pendiente_validacion',
      'cerrado',
      'rechazado',
      'no_reproducible',
      'duplicado'
    )),
  module text not null,
  page_name text not null,
  page_url text not null,
  user_id uuid not null,
  user_name_snapshot text not null,
  role_snapshot text not null,
  store_code text,
  store_name_snapshot text,
  kora_version text not null,
  deployment_version text,
  browser text,
  operating_system text,
  screen_resolution text,
  viewport text,
  connection_status text,
  session_identifier text,
  technical_context jsonb not null default '{}'::jsonb,
  console_errors jsonb not null default '[]'::jsonb,
  evidence_path text,
  evidence_name text,
  evidence_mime text,
  evidence_size bigint check (evidence_size is null or evidence_size between 1 and 10485760),
  assigned_to uuid,
  resolution_summary text,
  fixed_version text,
  duplicate_of uuid references public.kora_incidents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint kora_incidents_evidence_mime_check check (
    evidence_mime is null
    or evidence_mime in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')
  )
);

create table if not exists public.kora_incident_history (
  id bigint generated always as identity primary key,
  incident_id uuid not null references public.kora_incidents(id) on delete cascade,
  event_type text not null,
  previous_value jsonb,
  new_value jsonb,
  comment text,
  responsible_user_id uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.kora_incident_comments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.kora_incidents(id) on delete cascade,
  author_user_id uuid not null,
  author_name_snapshot text not null,
  author_role_snapshot text not null,
  body text not null check (char_length(body) between 1 and 3000),
  is_internal boolean not null default false,
  evidence_path text,
  evidence_name text,
  evidence_mime text,
  evidence_size bigint check (evidence_size is null or evidence_size between 1 and 10485760),
  created_at timestamptz not null default now()
);

create table if not exists public.kora_incident_notifications (
  id bigint generated always as identity primary key,
  incident_id uuid not null references public.kora_incidents(id) on delete cascade,
  event_type text not null,
  recipient_kind text not null check (recipient_kind in ('support', 'reporter')),
  priority text not null default 'normal' check (priority in ('normal', 'urgent')),
  payload jsonb not null,
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists kora_incidents_created_idx
  on public.kora_incidents (created_at desc);
create index if not exists kora_incidents_status_priority_idx
  on public.kora_incidents (status, priority, updated_at desc);
create index if not exists kora_incidents_store_idx
  on public.kora_incidents (store_code, updated_at desc);
create index if not exists kora_incidents_reporter_idx
  on public.kora_incidents (user_id, updated_at desc);
create index if not exists kora_incidents_assigned_idx
  on public.kora_incidents (assigned_to, updated_at desc);
create index if not exists kora_incident_history_incident_idx
  on public.kora_incident_history (incident_id, created_at);
create index if not exists kora_incident_comments_incident_idx
  on public.kora_incident_comments (incident_id, created_at);
create index if not exists kora_incident_notifications_pending_idx
  on public.kora_incident_notifications (delivery_status, created_at)
  where delivery_status in ('pending', 'failed');

insert into public.kora_incident_permissions (role_name, permission_name)
values
  ('asesor', 'incident_create'),
  ('asesor', 'incident_view_own'),
  ('asesor', 'incident_comment'),
  ('admin_tienda', 'incident_create'),
  ('admin_tienda', 'incident_view_own'),
  ('admin_tienda', 'incident_view_store'),
  ('admin_tienda', 'incident_comment'),
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
  ('gerencia', 'incident_generate_task'),
  ('auditoria', 'incident_create'),
  ('auditoria', 'incident_view_own'),
  ('auditoria', 'incident_view_store'),
  ('auditoria', 'incident_view_all'),
  ('auditoria', 'incident_comment'),
  ('auditoria', 'incident_assign'),
  ('auditoria', 'incident_change_priority'),
  ('auditoria', 'incident_change_status'),
  ('auditoria', 'incident_close'),
  ('auditoria', 'incident_admin'),
  ('auditoria', 'incident_generate_task'),
  ('soporte', 'incident_create'),
  ('soporte', 'incident_view_own'),
  ('soporte', 'incident_view_store'),
  ('soporte', 'incident_view_all'),
  ('soporte', 'incident_comment'),
  ('soporte', 'incident_assign'),
  ('soporte', 'incident_change_priority'),
  ('soporte', 'incident_change_status'),
  ('soporte', 'incident_close'),
  ('soporte', 'incident_admin'),
  ('soporte', 'incident_generate_task')
on conflict do nothing;

create or replace function public.kora_sanitize_incident_text(
  p_value text,
  p_max_length integer
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select left(
    regexp_replace(
      regexp_replace(trim(coalesce(p_value, '')), '[[:cntrl:]]', ' ', 'g'),
      '\s+',
      ' ',
      'g'
    ),
    greatest(p_max_length, 0)
  );
$$;

create or replace function public.kora_redact_incident_text(p_value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select regexp_replace(
    regexp_replace(
      coalesce(p_value, ''),
      '(authorization[[:space:]]*:[[:space:]]*bearer|access[_-]?token|refresh[_-]?token|password|contraseña|cookie|service[_-]?role)[[:space:]=:]+[^[:space:],;]+',
      '\1 [REDACTADO]',
      'gi'
    ),
    '([0-9][ -]*){13,19}',
    '[REDACTADO]',
    'g'
  );
$$;

create or replace function public.kora_incident_has_permission(
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.perfiles p
    join public.kora_incident_permissions permission
      on permission.role_name = p.rol
    where p.id = auth.uid()
      and p.activo = true
      and permission.permission_name = p_permission
  );
$$;

create or replace function public.kora_incident_can_view(
  p_incident public.kora_incidents
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.perfiles p
    where p.id = auth.uid()
      and p.activo = true
      and (
        public.kora_incident_has_permission('incident_view_all')
        or (
          public.kora_incident_has_permission('incident_view_own')
          and p_incident.user_id = auth.uid()
        )
        or (
          public.kora_incident_has_permission('incident_view_store')
          and p.tienda_codigo is not null
          and p.tienda_codigo = p_incident.store_code
        )
      )
  );
$$;

create or replace function public.kora_next_incident_code()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year integer := extract(year from timezone('America/Bogota', now()))::integer;
  v_number bigint;
begin
  insert into public.kora_incident_sequences (sequence_year, next_value)
  values (v_year, 2)
  on conflict (sequence_year) do update
  set next_value = public.kora_incident_sequences.next_value + 1,
      updated_at = now()
  returning next_value - 1 into v_number;

  return format('KORA-%s-%s', v_year, lpad(v_number::text, 6, '0'));
end;
$$;

create or replace function public.kora_create_incident(
  p_payload jsonb,
  p_local_incident_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.perfiles%rowtype;
  v_existing public.kora_incidents%rowtype;
  v_incident public.kora_incidents%rowtype;
  v_title text;
  v_description text;
  v_attempted text;
  v_additional text;
  v_priority text;
  v_store_code text;
  v_store_name text;
  v_console_errors jsonb;
begin
  if p_local_incident_id is null or p_payload is null then
    raise exception 'Identificador local y datos son obligatorios';
  end if;

  select *
  into v_profile
  from public.perfiles
  where id = auth.uid()
    and activo = true;

  if not found or not public.kora_incident_has_permission('incident_create') then
    raise exception 'No autorizado para crear incidencias';
  end if;

  select *
  into v_existing
  from public.kora_incidents
  where local_incident_id = p_local_incident_id
    and user_id = auth.uid();

  if found then
    return jsonb_build_object(
      'ok', true,
      'reused', true,
      'id', v_existing.id,
      'incident_code', v_existing.incident_code
    );
  end if;

  if (
    select count(*)
    from public.kora_incidents
    where user_id = auth.uid()
      and created_at >= now() - interval '1 hour'
  ) >= 10 then
    raise exception 'Límite de reportes excedido; intenta nuevamente más tarde';
  end if;

  v_title := public.kora_redact_incident_text(public.kora_sanitize_incident_text(p_payload->>'title', 160));
  v_description := public.kora_redact_incident_text(public.kora_sanitize_incident_text(p_payload->>'description', 5000));
  v_attempted := public.kora_redact_incident_text(public.kora_sanitize_incident_text(p_payload->>'attempted_action', 2000));
  v_additional := nullif(
    public.kora_redact_incident_text(public.kora_sanitize_incident_text(p_payload->>'additional_information', 3000)),
    ''
  );
  v_priority := lower(public.kora_sanitize_incident_text(p_payload->>'priority', 20));

  if char_length(v_title) < 5
     or char_length(v_description) < 10
     or char_length(v_attempted) < 5
     or v_priority not in ('baja', 'media', 'alta', 'critica') then
    raise exception 'Los datos de la incidencia no son válidos';
  end if;

  v_store_code := v_profile.tienda_codigo;
  if v_profile.rol in ('gerencia', 'auditoria', 'soporte')
     and nullif(public.kora_sanitize_incident_text(p_payload->>'store_code', 80), '') is not null then
    v_store_code := public.kora_sanitize_incident_text(p_payload->>'store_code', 80);
  end if;

  select o.nombre
  into v_store_name
  from public.origenes o
  where o.codigo = v_store_code
    and o.activo = true;

  if v_store_code is not null and v_store_name is null then
    raise exception 'La tienda de la incidencia no es válida';
  end if;

  select coalesce(jsonb_agg(public.kora_redact_incident_text(
    public.kora_sanitize_incident_text(item, 500)
  )), '[]'::jsonb)
  into v_console_errors
  from jsonb_array_elements_text(
    case when jsonb_typeof(p_payload->'console_errors') = 'array'
      then p_payload->'console_errors'
      else '[]'::jsonb
    end
  ) item;

  insert into public.kora_incidents (
    local_incident_id,
    incident_code,
    title,
    description,
    attempted_action,
    additional_information,
    priority,
    module,
    page_name,
    page_url,
    user_id,
    user_name_snapshot,
    role_snapshot,
    store_code,
    store_name_snapshot,
    kora_version,
    deployment_version,
    browser,
    operating_system,
    screen_resolution,
    viewport,
    connection_status,
    session_identifier,
    technical_context,
    console_errors
  )
  values (
    p_local_incident_id,
    public.kora_next_incident_code(),
    v_title,
    v_description,
    v_attempted,
    v_additional,
    v_priority,
    public.kora_sanitize_incident_text(p_payload->>'module', 120),
    public.kora_sanitize_incident_text(p_payload->>'page_name', 160),
    public.kora_sanitize_incident_text(p_payload->>'page_url', 1000),
    auth.uid(),
    public.kora_sanitize_incident_text(v_profile.nombre, 200),
    public.kora_sanitize_incident_text(v_profile.rol, 80),
    v_store_code,
    coalesce(v_store_name, v_store_code),
    public.kora_sanitize_incident_text(p_payload->>'kora_version', 80),
    nullif(public.kora_sanitize_incident_text(p_payload->>'deployment_version', 120), ''),
    nullif(public.kora_sanitize_incident_text(p_payload->>'browser', 160), ''),
    nullif(public.kora_sanitize_incident_text(p_payload->>'operating_system', 160), ''),
    nullif(public.kora_sanitize_incident_text(p_payload->>'screen_resolution', 80), ''),
    nullif(public.kora_sanitize_incident_text(p_payload->>'viewport', 80), ''),
    nullif(public.kora_sanitize_incident_text(p_payload->>'connection_status', 40), ''),
    nullif(public.kora_sanitize_incident_text(p_payload->>'session_identifier', 100), ''),
    jsonb_build_object(
      'browser', public.kora_redact_incident_text(public.kora_sanitize_incident_text(p_payload->>'browser', 160)),
      'operating_system', public.kora_sanitize_incident_text(p_payload->>'operating_system', 160),
      'screen_resolution', public.kora_sanitize_incident_text(p_payload->>'screen_resolution', 80),
      'viewport', public.kora_sanitize_incident_text(p_payload->>'viewport', 80),
      'connection_status', public.kora_sanitize_incident_text(p_payload->>'connection_status', 40),
      'session_identifier', public.kora_sanitize_incident_text(p_payload->>'session_identifier', 100)
    ),
    v_console_errors
  )
  returning * into v_incident;

  insert into public.kora_incident_history (
    incident_id,
    event_type,
    new_value,
    responsible_user_id
  )
  values (
    v_incident.id,
    'created',
    jsonb_build_object('status', v_incident.status, 'priority', v_incident.priority),
    auth.uid()
  );

  insert into public.kora_incident_notifications (
    incident_id,
    event_type,
    recipient_kind,
    priority,
    payload
  )
  values (
    v_incident.id,
    'created',
    'support',
    case when v_incident.priority = 'critica' then 'urgent' else 'normal' end,
    jsonb_build_object(
      'incident_code', v_incident.incident_code,
      'priority', v_incident.priority,
      'store', v_incident.store_name_snapshot,
      'module', v_incident.module,
      'title', v_incident.title,
      'internal_path', '/creditek/erp/incidencias.html?id=' || v_incident.id::text
    )
  );

  return jsonb_build_object(
    'ok', true,
    'reused', false,
    'id', v_incident.id,
    'incident_code', v_incident.incident_code
  );
end;
$$;

create or replace function public.kora_attach_incident_evidence(
  p_incident_id uuid,
  p_path text,
  p_name text,
  p_mime text,
  p_size bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_incident public.kora_incidents%rowtype;
begin
  select *
  into v_incident
  from public.kora_incidents
  where id = p_incident_id
  for update;

  if not found
     or not public.kora_incident_can_view(v_incident)
     or not (
       v_incident.user_id = auth.uid()
       or public.kora_incident_has_permission('incident_admin')
     ) then
    raise exception 'No autorizado para adjuntar evidencia';
  end if;
  if p_path !~ ('^' || p_incident_id::text || '/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|pdf)$')
     or p_mime not in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')
     or p_size is null
     or p_size < 1
     or p_size > 10485760 then
    raise exception 'La evidencia no es válida';
  end if;

  update public.kora_incidents
  set evidence_path = p_path,
      evidence_name = public.kora_sanitize_incident_text(p_name, 240),
      evidence_mime = p_mime,
      evidence_size = p_size,
      updated_at = now()
  where id = p_incident_id;

  insert into public.kora_incident_history (
    incident_id,
    event_type,
    new_value,
    responsible_user_id
  )
  values (
    p_incident_id,
    'evidence_added',
    jsonb_build_object('mime', p_mime, 'size', p_size),
    auth.uid()
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.kora_add_incident_comment(
  p_incident_id uuid,
  p_body text,
  p_is_internal boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.perfiles%rowtype;
  v_incident public.kora_incidents%rowtype;
  v_comment public.kora_incident_comments%rowtype;
  v_body text;
begin
  select * into v_profile
  from public.perfiles
  where id = auth.uid() and activo = true;
  select * into v_incident
  from public.kora_incidents
  where id = p_incident_id;

  if not found
     or not public.kora_incident_can_view(v_incident)
     or not public.kora_incident_has_permission('incident_comment') then
    raise exception 'No autorizado para comentar';
  end if;
  if coalesce(p_is_internal, false)
     and not public.kora_incident_has_permission('incident_admin') then
    raise exception 'Los comentarios internos son exclusivos de soporte';
  end if;

  v_body := public.kora_sanitize_incident_text(p_body, 3000);
  if char_length(v_body) < 1 then
    raise exception 'El comentario está vacío';
  end if;

  insert into public.kora_incident_comments (
    incident_id,
    author_user_id,
    author_name_snapshot,
    author_role_snapshot,
    body,
    is_internal
  )
  values (
    p_incident_id,
    auth.uid(),
    v_profile.nombre,
    v_profile.rol,
    v_body,
    coalesce(p_is_internal, false)
  )
  returning * into v_comment;

  insert into public.kora_incident_history (
    incident_id,
    event_type,
    new_value,
    responsible_user_id
  )
  values (
    p_incident_id,
    'comment_added',
    jsonb_build_object('comment_id', v_comment.id, 'internal', v_comment.is_internal),
    auth.uid()
  );

  return jsonb_build_object('ok', true, 'id', v_comment.id);
end;
$$;

create or replace function public.kora_attach_incident_comment_evidence(
  p_comment_id uuid,
  p_path text,
  p_name text,
  p_mime text,
  p_size bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_comment public.kora_incident_comments%rowtype;
  v_incident public.kora_incidents%rowtype;
begin
  select * into v_comment
  from public.kora_incident_comments
  where id = p_comment_id
  for update;
  select * into v_incident
  from public.kora_incidents
  where id = v_comment.incident_id;

  if v_comment.id is null
     or not public.kora_incident_can_view(v_incident)
     or not (v_comment.author_user_id = auth.uid()
       or public.kora_incident_has_permission('incident_admin')) then
    raise exception 'No autorizado para adjuntar evidencia al comentario';
  end if;
  if p_path !~ ('^' || v_incident.id::text || '/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|pdf)$')
     or p_mime not in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')
     or p_size is null or p_size < 1 or p_size > 10485760 then
    raise exception 'La evidencia del comentario no es válida';
  end if;

  update public.kora_incident_comments
  set evidence_path = p_path,
      evidence_name = public.kora_sanitize_incident_text(p_name, 240),
      evidence_mime = p_mime,
      evidence_size = p_size
  where id = p_comment_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.kora_update_incident(
  p_incident_id uuid,
  p_status text default null,
  p_priority text default null,
  p_assigned_to uuid default null,
  p_resolution_summary text default null,
  p_fixed_version text default null
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
  v_allowed boolean;
begin
  select * into v_incident
  from public.kora_incidents
  where id = p_incident_id
  for update;
  if not found or not public.kora_incident_has_permission('incident_admin') then
    raise exception 'No autorizado para administrar incidencias';
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), v_incident.status);
  v_priority := coalesce(nullif(trim(p_priority), ''), v_incident.priority);
  if v_priority <> v_incident.priority
     and not public.kora_incident_has_permission('incident_change_priority') then
    raise exception 'No autorizado para cambiar prioridad';
  end if;
  if v_status <> v_incident.status then
    if not public.kora_incident_has_permission('incident_change_status') then
      raise exception 'No autorizado para cambiar estado';
    end if;
    v_allowed := case v_incident.status
      when 'nuevo' then v_status in ('en_revision', 'rechazado', 'duplicado')
      when 'en_revision' then v_status in ('confirmado', 'no_reproducible', 'rechazado', 'duplicado')
      when 'confirmado' then v_status in ('en_desarrollo', 'rechazado', 'duplicado')
      when 'en_desarrollo' then v_status in ('corregido', 'no_reproducible')
      when 'corregido' then v_status in ('pendiente_validacion', 'en_desarrollo')
      when 'pendiente_validacion' then v_status in ('cerrado', 'en_desarrollo')
      when 'no_reproducible' then v_status = 'en_revision'
      when 'duplicado' then v_status = 'en_revision'
      else false
    end;
    if not v_allowed then
      raise exception 'Transición de estado no permitida';
    end if;
  end if;
  if v_priority not in ('baja', 'media', 'alta', 'critica') then
    raise exception 'Prioridad no válida';
  end if;

  update public.kora_incidents
  set status = v_status,
      priority = v_priority,
      assigned_to = coalesce(p_assigned_to, assigned_to),
      resolution_summary = coalesce(
        nullif(public.kora_sanitize_incident_text(p_resolution_summary, 4000), ''),
        resolution_summary
      ),
      fixed_version = coalesce(
        nullif(public.kora_sanitize_incident_text(p_fixed_version, 120), ''),
        fixed_version
      ),
      updated_at = now(),
      closed_at = case when v_status = 'cerrado' then now() else closed_at end
  where id = p_incident_id
  returning * into v_incident;

  return jsonb_build_object(
    'ok', true,
    'id', v_incident.id,
    'status', v_incident.status,
    'priority', v_incident.priority
  );
end;
$$;

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
  if not found or v_incident.user_id <> auth.uid() then
    raise exception 'Solo quien reportó puede confirmar la solución';
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

create or replace function public.kora_find_similar_incidents(
  p_title text,
  p_module text,
  p_page_name text,
  p_store_code text,
  p_kora_version text
)
returns table (
  id uuid,
  incident_code text,
  title text,
  priority text,
  status text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.id, i.incident_code, i.title, i.priority, i.status, i.updated_at
  from public.kora_incidents i
  where i.status not in ('cerrado', 'rechazado', 'no_reproducible', 'duplicado')
    and i.module = p_module
    and i.page_name = p_page_name
    and i.store_code is not distinct from p_store_code
    and i.kora_version = p_kora_version
    and to_tsvector('simple', i.title) @@ plainto_tsquery('simple', p_title)
    and public.kora_incident_can_view(i)
  order by i.updated_at desc
  limit 5;
$$;

create or replace function public.kora_incident_metrics(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not public.kora_incident_has_permission('incident_admin') then
    raise exception 'No autorizado para consultar métricas';
  end if;
  select jsonb_build_object(
    'nuevas', count(*) filter (where status = 'nuevo'),
    'criticas', count(*) filter (
      where priority = 'critica'
        and status not in ('cerrado', 'rechazado', 'no_reproducible', 'duplicado')
    ),
    'en_desarrollo', count(*) filter (where status = 'en_desarrollo'),
    'pendientes_validacion', count(*) filter (where status = 'pendiente_validacion'),
    'cerradas_mes', count(*) filter (
      where status = 'cerrado'
        and closed_at >= date_trunc('month', timezone('America/Bogota', now()))
    ),
    'promedio_resolucion_horas', round(
      avg(extract(epoch from (closed_at - created_at)) / 3600)
        filter (where closed_at is not null),
      1
    )
  )
  into v_result
  from public.kora_incidents
  where (p_from is null or created_at >= p_from)
    and (p_to is null or created_at <= p_to);
  return coalesce(v_result, '{}'::jsonb);
end;
$$;

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

drop trigger if exists kora_incidents_audit_changes on public.kora_incidents;
create trigger kora_incidents_audit_changes
before update on public.kora_incidents
for each row execute function public.kora_incident_audit_changes();

alter table public.kora_incident_sequences enable row level security;
alter table public.kora_incident_permissions enable row level security;
alter table public.kora_incidents enable row level security;
alter table public.kora_incident_history enable row level security;
alter table public.kora_incident_comments enable row level security;
alter table public.kora_incident_notifications enable row level security;

drop policy if exists kora_incidents_select_authorized on public.kora_incidents;
create policy kora_incidents_select_authorized
on public.kora_incidents
for select
to authenticated
using (public.kora_incident_can_view(kora_incidents));

drop policy if exists kora_incident_history_select_authorized on public.kora_incident_history;
create policy kora_incident_history_select_authorized
on public.kora_incident_history
for select
to authenticated
using (
  exists (
    select 1
    from public.kora_incidents i
    where i.id = kora_incident_history.incident_id
      and public.kora_incident_can_view(i)
  )
);

drop policy if exists kora_incident_comments_select_authorized on public.kora_incident_comments;
create policy kora_incident_comments_select_authorized
on public.kora_incident_comments
for select
to authenticated
using (
  exists (
    select 1
    from public.kora_incidents i
    where i.id = kora_incident_comments.incident_id
      and public.kora_incident_can_view(i)
      and (
        not kora_incident_comments.is_internal
        or public.kora_incident_has_permission('incident_admin')
      )
  )
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'kora-incident-evidence',
  'kora-incident-evidence',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = excluded.allowed_mime_types;

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
      and (
        i.user_id = auth.uid()
        or public.kora_incident_has_permission('incident_admin')
      )
  )
);

drop policy if exists kora_incident_evidence_select_authorized on storage.objects;
create policy kora_incident_evidence_select_authorized
on storage.objects
for select
to authenticated
using (
  bucket_id = 'kora-incident-evidence'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|pdf)$'
  and exists (
    select 1
    from public.kora_incidents i
    where i.id = (storage.foldername(name))[1]::uuid
      and public.kora_incident_can_view(i)
  )
);

revoke all on public.kora_incident_sequences from public, anon, authenticated;
revoke all on public.kora_incident_permissions from public, anon, authenticated;
revoke all on public.kora_incidents from public, anon;
revoke insert, update, delete on public.kora_incidents from authenticated;
grant select on public.kora_incidents to authenticated;
revoke all on public.kora_incident_history from public, anon;
revoke insert, update, delete on public.kora_incident_history from authenticated;
grant select on public.kora_incident_history to authenticated;
revoke all on public.kora_incident_comments from public, anon;
revoke insert, update, delete on public.kora_incident_comments from authenticated;
grant select on public.kora_incident_comments to authenticated;
revoke all on public.kora_incident_notifications from public, anon, authenticated;

revoke all on function public.kora_sanitize_incident_text(text, integer)
  from public, anon, authenticated;
revoke all on function public.kora_redact_incident_text(text)
  from public, anon, authenticated;
revoke all on function public.kora_incident_can_view(public.kora_incidents)
  from public, anon, authenticated;
revoke all on function public.kora_next_incident_code()
  from public, anon, authenticated;
revoke all on function public.kora_incident_audit_changes()
  from public, anon, authenticated;

revoke all on function public.kora_incident_has_permission(text)
  from public, anon;
grant execute on function public.kora_incident_has_permission(text)
  to authenticated;
grant execute on function public.kora_incident_can_view(public.kora_incidents)
  to authenticated;
revoke all on function public.kora_create_incident(jsonb, uuid)
  from public, anon;
grant execute on function public.kora_create_incident(jsonb, uuid)
  to authenticated;
revoke all on function public.kora_attach_incident_evidence(uuid, text, text, text, bigint)
  from public, anon;
grant execute on function public.kora_attach_incident_evidence(uuid, text, text, text, bigint)
  to authenticated;
revoke all on function public.kora_add_incident_comment(uuid, text, boolean)
  from public, anon;
grant execute on function public.kora_add_incident_comment(uuid, text, boolean)
  to authenticated;
revoke all on function public.kora_attach_incident_comment_evidence(uuid, text, text, text, bigint)
  from public, anon;
grant execute on function public.kora_attach_incident_comment_evidence(uuid, text, text, text, bigint)
  to authenticated;
revoke all on function public.kora_update_incident(uuid, text, text, uuid, text, text)
  from public, anon;
grant execute on function public.kora_update_incident(uuid, text, text, uuid, text, text)
  to authenticated;
revoke all on function public.kora_confirm_incident_resolved(uuid)
  from public, anon;
grant execute on function public.kora_confirm_incident_resolved(uuid)
  to authenticated;
revoke all on function public.kora_find_similar_incidents(text, text, text, text, text)
  from public, anon;
grant execute on function public.kora_find_similar_incidents(text, text, text, text, text)
  to authenticated;
revoke all on function public.kora_incident_metrics(timestamptz, timestamptz)
  from public, anon;
grant execute on function public.kora_incident_metrics(timestamptz, timestamptz)
  to authenticated;

commit;

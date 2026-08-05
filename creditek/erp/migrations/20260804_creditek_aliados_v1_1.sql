begin;

do $$ begin
  if to_regclass('public.perfiles') is null or to_regclass('public.ejecutivos') is null
     or to_regclass('public.origenes') is null or to_regclass('public.audit_log') is null then
    raise exception 'Dependencias KORA faltantes: perfiles, ejecutivos, origenes o audit_log';
  end if;
end $$;

create table if not exists public.aliados (
  id uuid primary key default gen_random_uuid(),
  nombre_comercial text not null,
  razon_social text,
  identificacion text,
  propietario text,
  ejecutivo_id uuid references public.ejecutivos(id),
  ciudad_principal text,
  estado text not null default 'activo' check (estado in ('activo','suspendido','inactivo')),
  estado_asociacion text not null default 'confirmada' check (estado_asociacion in ('confirmada','pendiente_asociacion')),
  fecha_vinculacion date not null default current_date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint aliados_ejecutivo_confirmado check (estado_asociacion = 'pendiente_asociacion' or ejecutivo_id is not null)
);
create unique index if not exists aliados_identificacion_uq on public.aliados(lower(identificacion)) where identificacion is not null and btrim(identificacion) <> '';
create index if not exists aliados_ejecutivo_idx on public.aliados(ejecutivo_id);
create index if not exists aliados_estado_idx on public.aliados(estado);

create table if not exists public.aliados_sedes (
  id uuid primary key default gen_random_uuid(),
  aliado_id uuid references public.aliados(id) on delete restrict,
  origen_codigo text unique references public.origenes(codigo) on delete restrict,
  nombre text not null,
  ciudad text,
  direccion text,
  estado_asociacion text not null default 'confirmada' check (estado_asociacion in ('confirmada','pendiente_asociacion')),
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint aliados_sede_asociada check (estado_asociacion = 'pendiente_asociacion' or aliado_id is not null)
);
create index if not exists aliados_sedes_aliado_idx on public.aliados_sedes(aliado_id);
create index if not exists aliados_sedes_ciudad_idx on public.aliados_sedes(ciudad);

create table if not exists public.aliados_plataformas (
  id uuid primary key default gen_random_uuid(),
  aliado_id uuid references public.aliados(id) on delete restrict,
  sede_id uuid references public.aliados_sedes(id) on delete restrict,
  plataforma text not null check (plataforma in ('payjoy','alo')),
  estado text not null default 'solicitada' check (estado in ('solicitada','activa','suspendida','rechazada')),
  solicitada_at timestamptz not null default now(),
  activada_at timestamptz,
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint aliados_plataforma_propietario check (aliado_id is not null or sede_id is not null)
);
create unique index if not exists aliados_plataformas_uq on public.aliados_plataformas(coalesce(aliado_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(sede_id,'00000000-0000-0000-0000-000000000000'::uuid),plataforma);

create table if not exists public.aliados_documentos (
  id uuid primary key default gen_random_uuid(),
  aliado_id uuid not null references public.aliados(id) on delete restrict,
  sede_id uuid references public.aliados_sedes(id) on delete restrict,
  tipo text not null,
  nombre text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobado','rechazado','vencido')),
  storage_path text,
  fecha_vencimiento date,
  revisado_por uuid references auth.users(id),
  revisado_at timestamptz,
  observacion text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create index if not exists aliados_documentos_aliado_idx on public.aliados_documentos(aliado_id,estado);

create table if not exists public.aliados_estado_historial (
  id bigint generated always as identity primary key,
  aliado_id uuid not null references public.aliados(id) on delete restrict,
  estado_anterior text not null,
  estado_nuevo text not null,
  motivo text not null check (length(btrim(motivo)) >= 5),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists aliados_estado_historial_idx on public.aliados_estado_historial(aliado_id,created_at desc);

create table if not exists public.aliados_domain_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('ally.created','ally.updated','ally.suspended','ally.reactivated','ally.document.reviewed')),
  aggregate_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  occurred_at timestamptz not null default now(),
  published_at timestamptz,
  publish_attempts integer not null default 0
);
create index if not exists aliados_domain_events_pending_idx on public.aliados_domain_events(occurred_at) where published_at is null;

insert into public.aliados_sedes(origen_codigo,nombre,estado_asociacion,activa)
select o.codigo,o.nombre,'pendiente_asociacion',o.activo
from public.origenes o
where o.tipo='aliado'
on conflict (origen_codigo) do nothing;

create or replace function public.puede_gestionar_aliados()
returns boolean language sql stable security definer set search_path=public,auth as $$
  select exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo and p.rol = 'gerencia')
      or coalesce(public.tiene_capacidad_aliados('revisor'),false)
$$;

create or replace function public.aliados_guardar_maestro(
  p_id uuid, p_nombre_comercial text, p_razon_social text, p_identificacion text,
  p_propietario text, p_ejecutivo_id uuid, p_ciudad_principal text, p_motivo text default null
) returns uuid language plpgsql security definer set search_path=public,auth as $$
declare v_id uuid; v_anterior uuid;
begin
  if not public.puede_gestionar_aliados() then raise exception 'Acceso denegado'; end if;
  if nullif(btrim(p_nombre_comercial),'') is null or p_ejecutivo_id is null then raise exception 'Nombre y ejecutivo son obligatorios'; end if;
  if p_id is null then
    insert into public.aliados(nombre_comercial,razon_social,identificacion,propietario,ejecutivo_id,ciudad_principal,created_by,updated_by)
    values(btrim(p_nombre_comercial),nullif(btrim(p_razon_social),''),nullif(btrim(p_identificacion),''),nullif(btrim(p_propietario),''),p_ejecutivo_id,nullif(btrim(p_ciudad_principal),''),auth.uid(),auth.uid()) returning id into v_id;
    insert into public.aliados_domain_events(event_type,aggregate_id,payload,idempotency_key) values('ally.created',v_id,jsonb_build_object('actor_id',auth.uid()),'ally.created:'||v_id);
  else
    select ejecutivo_id into v_anterior from public.aliados where id=p_id for update;
    if not found then raise exception 'Aliado no encontrado'; end if;
    if v_anterior is distinct from p_ejecutivo_id and length(btrim(coalesce(p_motivo,''))) < 5 then raise exception 'Motivo obligatorio para cambiar ejecutivo'; end if;
    update public.aliados set nombre_comercial=btrim(p_nombre_comercial),razon_social=nullif(btrim(p_razon_social),''),identificacion=nullif(btrim(p_identificacion),''),propietario=nullif(btrim(p_propietario),''),ejecutivo_id=p_ejecutivo_id,ciudad_principal=nullif(btrim(p_ciudad_principal),''),updated_at=now(),updated_by=auth.uid() where id=p_id;
    v_id:=p_id;
    insert into public.aliados_domain_events(event_type,aggregate_id,payload,idempotency_key) values('ally.updated',v_id,jsonb_build_object('actor_id',auth.uid(),'motivo',nullif(btrim(p_motivo),'')),'ally.updated:'||v_id||':'||extract(epoch from clock_timestamp())::text);
  end if;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),case when p_id is null then 'aliado_creado' else 'aliado_editado' end,'aliados',v_id,jsonb_build_object('motivo',nullif(btrim(p_motivo),'')));
  return v_id;
end $$;

create or replace function public.aliados_cambiar_estado_maestro(p_id uuid,p_estado text,p_motivo text)
returns void language plpgsql security definer set search_path=public,auth as $$
declare v_anterior text; v_evento text;
begin
  if not public.puede_gestionar_aliados() then raise exception 'Acceso denegado'; end if;
  if p_estado not in ('suspendido','activo') then raise exception 'Estado inválido'; end if;
  if length(btrim(coalesce(p_motivo,''))) < 5 then raise exception 'Motivo obligatorio'; end if;
  select estado into v_anterior from public.aliados where id=p_id for update;
  if not found then raise exception 'Aliado no encontrado'; end if;
  if v_anterior=p_estado then return; end if;
  update public.aliados set estado=p_estado,updated_at=now(),updated_by=auth.uid() where id=p_id;
  insert into public.aliados_estado_historial(aliado_id,estado_anterior,estado_nuevo,motivo,actor_id) values(p_id,v_anterior,p_estado,btrim(p_motivo),auth.uid());
  v_evento:=case when p_estado='suspendido' then 'ally.suspended' else 'ally.reactivated' end;
  insert into public.aliados_domain_events(event_type,aggregate_id,payload,idempotency_key) values(v_evento,p_id,jsonb_build_object('motivo',btrim(p_motivo),'actor_id',auth.uid()),v_evento||':'||p_id||':'||extract(epoch from clock_timestamp())::text);
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),case when p_estado='suspendido' then 'aliado_suspendido' else 'aliado_reactivado' end,'aliados',p_id,jsonb_build_object('motivo',btrim(p_motivo),'estado_anterior',v_anterior,'estado_nuevo',p_estado));
end $$;

create or replace function public.aliados_suspendender(p_id uuid,p_motivo text) returns void language sql security definer set search_path=public,auth as $$ select public.aliados_cambiar_estado_maestro(p_id,'suspendido',p_motivo) $$;
create or replace function public.aliados_reactivar(p_id uuid,p_motivo text) returns void language sql security definer set search_path=public,auth as $$ select public.aliados_cambiar_estado_maestro(p_id,'activo',p_motivo) $$;

alter table public.aliados enable row level security;
alter table public.aliados_sedes enable row level security;
alter table public.aliados_plataformas enable row level security;
alter table public.aliados_documentos enable row level security;
alter table public.aliados_estado_historial enable row level security;
alter table public.aliados_domain_events enable row level security;

revoke all on public.aliados from anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['aliados','aliados_sedes','aliados_plataformas','aliados_documentos','aliados_estado_historial','aliados_domain_events'] loop
    execute format('drop policy if exists aliados_v11_select on public.%I',t);
    execute format('create policy aliados_v11_select on public.%I for select to authenticated using (public.puede_gestionar_aliados())',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;

revoke all on function public.puede_gestionar_aliados() from public,anon,authenticated;
grant execute on function public.puede_gestionar_aliados() to authenticated;
revoke all on function public.aliados_guardar_maestro(uuid,text,text,text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.aliados_guardar_maestro(uuid,text,text,text,text,uuid,text,text) to authenticated;
revoke all on function public.aliados_cambiar_estado_maestro(uuid,text,text) from public,anon,authenticated;
revoke all on function public.aliados_suspendender(uuid,text) from public,anon,authenticated;
revoke all on function public.aliados_reactivar(uuid,text) from public,anon,authenticated;
grant execute on function public.aliados_suspendender(uuid,text) to authenticated;
grant execute on function public.aliados_reactivar(uuid,text) to authenticated;

commit;

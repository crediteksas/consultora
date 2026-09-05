-- Instrucciones de Gerencia y seguimiento de gestión en la plataforma Krediya.
-- Versión sincronizada con el historial aplicado por Supabase MCP.
-- Es un registro operativo independiente: NO modifica precios, liquidaciones,
-- novedades financieras, cálculos, cartera, bonos ni autorizaciones de pago.

create table public.krediya_instrucciones (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.liquidation_operations(id),
  liquidation_id uuid not null references public.liquidations(id),
  responsable_id uuid not null references public.perfiles(id),
  responsable_nombre text not null,
  autor_id uuid not null references public.perfiles(id) default auth.uid(),
  autor_nombre text not null,
  instruccion text not null check (char_length(btrim(instruccion)) between 5 and 4000),
  pvp_objetivo numeric(16,2) check (pvp_objetivo is null or (pvp_objetivo > 0 and pvp_objetivo < 100000000000000)),
  contexto jsonb not null check (jsonb_typeof(contexto) = 'object'),
  created_at timestamptz not null default clock_timestamp()
);

create table public.krediya_gestiones (
  id uuid primary key default gen_random_uuid(),
  instruccion_id uuid not null references public.krediya_instrucciones(id),
  estado text not null check (estado in ('en_gestion','realizada','no_aplicada')),
  comentario text not null check (char_length(btrim(comentario)) between 5 and 4000),
  evidencia text check (evidencia is null or char_length(btrim(evidencia)) between 1 and 2000),
  autor_id uuid not null references public.perfiles(id) default auth.uid(),
  autor_nombre text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint krediya_gestion_realizada_evidencia check (
    estado <> 'realizada' or nullif(btrim(evidencia), '') is not null
  )
);

comment on table public.krediya_instrucciones is
  'Instrucciones de Gerencia para gestionar en Krediya externa. El PVP objetivo no es un precio aplicado en KORA ni una autorización de pago.';
comment on table public.krediya_gestiones is
  'Historial inmutable de gestión externa. Realizada significa reportada por su responsable, no una verificación automática en Krediya ni la resolución de la liquidación.';

create index krediya_instrucciones_lote_fecha_idx
  on public.krediya_instrucciones(liquidation_id, created_at desc);
create index krediya_instrucciones_operacion_idx
  on public.krediya_instrucciones(operation_id, created_at desc);
create index krediya_instrucciones_responsable_idx
  on public.krediya_instrucciones(responsable_id, created_at desc);
create index krediya_instrucciones_autor_idx
  on public.krediya_instrucciones(autor_id);
create index krediya_gestiones_instruccion_fecha_idx
  on public.krediya_gestiones(instruccion_id, created_at desc);
create index krediya_gestiones_autor_idx
  on public.krediya_gestiones(autor_id);

-- INVOKER mantiene los permisos y RLS del usuario que registra la instrucción.
-- Los campos protegidos se derivan del servidor y no tienen INSERT concedido.
create function public.krediya_preparar_instruccion()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp
as $$
declare
  o public.liquidation_operations%rowtype;
  l public.liquidations%rowtype;
  c jsonb;
begin
  if auth.uid() is null or not public.tiene_capacidad_aliados('aprobador') then
    raise exception 'Solo Gerencia puede dejar instrucciones para Krediya';
  end if;

  select * into o from public.liquidation_operations
  where id = new.operation_id and plataforma = 'krediya';
  if not found or not o.reconocida then
    raise exception 'La instrucción requiere una operación Krediya reconocida';
  end if;

  select * into l from public.liquidations where id = o.liquidation_id;
  if not found or l.plataforma <> 'krediya' or l.frozen_at is not null
     or l.estado not in ('importada','con_novedades','validada','calculada','revisada') then
    raise exception 'No se pueden crear instrucciones desde una liquidación congelada o cerrada';
  end if;

  select btrim(p.nombre) into new.responsable_nombre
  from public.perfiles p join public.aliados_operadores a on a.perfil_id = p.id
  where p.id = new.responsable_id and p.activo and a.activo and a.capacidad = 'revisor';
  if not found or nullif(new.responsable_nombre, '') is null then
    raise exception 'Selecciona una responsable de revisión activa';
  end if;

  new.autor_id := auth.uid();
  select btrim(p.nombre) into new.autor_nombre
  from public.perfiles p where p.id = new.autor_id and p.activo;
  if not found or nullif(new.autor_nombre, '') is null then
    raise exception 'No se pudo identificar al usuario de Gerencia';
  end if;

  c := public.aliados_contexto_precio_krediya(o.id);
  new.liquidation_id := o.liquidation_id;
  new.instruccion := btrim(new.instruccion);
  new.contexto := jsonb_build_object(
    'plataforma', 'krediya',
    'referencia', coalesce(c->>'referencia', o.referencia, o.modelo),
    'imei', o.imei,
    'tienda', o.establishment_name,
    'fecha', (o.operation_at at time zone 'America/Bogota')::date,
    'pvp_guardado', c->'pvp_guardado',
    'pvp_recibido', c->'pvp_recibido',
    'pagamos_guardado', c->'pagamos_guardado',
    'pagamos_recibido', c->'pagamos_recibido',
    'inicial', o.inicial
  );
  new.created_at := clock_timestamp();
  return new;
end;
$$;

create function public.krediya_preparar_gestion()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp
as $$
declare
  i public.krediya_instrucciones%rowtype;
begin
  if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then
    raise exception 'No autorizado para registrar gestiones Krediya';
  end if;

  select * into i from public.krediya_instrucciones where id = new.instruccion_id;
  if not found then raise exception 'Instrucción no encontrada'; end if;
  if not public.tiene_capacidad_aliados('aprobador') and not (
    i.responsable_id = auth.uid() and exists (
      select 1 from public.aliados_operadores a join public.perfiles p on p.id = a.perfil_id
      where a.perfil_id = auth.uid() and a.capacidad = 'revisor' and a.activo and p.activo
    )
  ) then
    raise exception 'Solo la responsable asignada o Gerencia puede registrar esta gestión';
  end if;

  new.autor_id := auth.uid();
  select btrim(p.nombre) into new.autor_nombre
  from public.perfiles p where p.id = new.autor_id and p.activo;
  if not found or nullif(new.autor_nombre, '') is null then
    raise exception 'No se pudo identificar al usuario que registra la gestión';
  end if;

  new.comentario := btrim(new.comentario);
  new.evidencia := nullif(btrim(new.evidencia), '');
  new.created_at := clock_timestamp();
  -- El seguimiento externo continúa incluso si el lote se congela después.
  -- No se resuelve la novedad financiera ni se toca el lote o la operación.
  return new;
end;
$$;

create function public.krediya_impedir_reescritura_gestion()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp
as $$
begin
  raise exception 'El historial de instrucciones y gestiones no puede modificarse ni borrarse; registra un nuevo seguimiento';
end;
$$;

create trigger krediya_instruccion_preparar
before insert on public.krediya_instrucciones
for each row execute function public.krediya_preparar_instruccion();
create trigger krediya_gestion_preparar
before insert on public.krediya_gestiones
for each row execute function public.krediya_preparar_gestion();
create trigger krediya_instrucciones_inmutables
before update or delete on public.krediya_instrucciones
for each row execute function public.krediya_impedir_reescritura_gestion();
create trigger krediya_gestiones_inmutables
before update or delete on public.krediya_gestiones
for each row execute function public.krediya_impedir_reescritura_gestion();

alter table public.krediya_instrucciones enable row level security;
alter table public.krediya_gestiones enable row level security;
revoke all on table public.krediya_instrucciones, public.krediya_gestiones from public, anon, authenticated;
grant select on table public.krediya_instrucciones, public.krediya_gestiones to authenticated;
grant insert (operation_id, responsable_id, instruccion, pvp_objetivo)
  on public.krediya_instrucciones to authenticated;
grant insert (instruccion_id, estado, comentario, evidencia)
  on public.krediya_gestiones to authenticated;

create policy krediya_instrucciones_leer on public.krediya_instrucciones
for select to authenticated
using ((select public.tiene_capacidad_aliados('revisor')));
create policy krediya_instrucciones_crear on public.krediya_instrucciones
for insert to authenticated
with check (
  autor_id = (select auth.uid())
  and (select public.tiene_capacidad_aliados('aprobador'))
);
create policy krediya_gestiones_leer on public.krediya_gestiones
for select to authenticated
using ((select public.tiene_capacidad_aliados('revisor')));
create policy krediya_gestiones_crear on public.krediya_gestiones
for insert to authenticated
with check (
  autor_id = (select auth.uid())
  and (select public.tiene_capacidad_aliados('revisor'))
  and exists (
    select 1 from public.krediya_instrucciones i
    where i.id = instruccion_id
      and (i.responsable_id = (select auth.uid()) or (select public.tiene_capacidad_aliados('aprobador')))
  )
);

revoke all on function public.krediya_preparar_instruccion(),
  public.krediya_preparar_gestion(), public.krediya_impedir_reescritura_gestion()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

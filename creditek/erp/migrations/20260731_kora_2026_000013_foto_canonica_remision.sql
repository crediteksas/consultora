-- KORA-2026-000013 · Foto canónica global durante recepción de remisiones.
begin;

do $preflight$
begin
  if to_regclass('public.productos') is null
     or to_regclass('public.remisiones') is null
     or to_regclass('public.remision_items') is null
     or to_regclass('public.perfiles') is null
     or to_regclass('storage.objects') is null then
    raise exception 'Faltan dependencias para KORA-2026-000013';
  end if;
end;
$preflight$;

create table if not exists public.producto_foto_historial (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null
    references public.productos(id) on delete restrict,
  foto_url_anterior text,
  foto_url_nueva text,
  accion text not null check (accion in ('cargar', 'reemplazar', 'eliminar')),
  origen text not null check (origen in ('recepcion', 'catalogo', 'sistema')),
  remision_id uuid references public.remisiones(id) on delete restrict,
  tienda_codigo text references public.origenes(codigo) on update cascade on delete restrict,
  motivo text,
  usuario_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists producto_foto_historial_producto_idx
  on public.producto_foto_historial(producto_id, created_at desc);

create or replace function public.auditar_foto_producto()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_anterior text;
  v_nueva text;
  v_accion text;
  v_origen text;
  v_remision uuid;
  v_tienda text;
  v_motivo text;
begin
  v_anterior := case when tg_op = 'INSERT' then null else old.foto_url end;
  v_nueva := new.foto_url;
  if nullif(btrim(coalesce(v_nueva, '')), '') is null then
    if nullif(btrim(coalesce(v_anterior, '')), '') is null then
      return new;
    end if;
    v_accion := 'eliminar';
  elsif nullif(btrim(coalesce(v_anterior, '')), '') is null then
    v_accion := 'cargar';
  else
    v_accion := 'reemplazar';
  end if;

  v_origen := coalesce(
    nullif(current_setting('kora.foto_origen', true), ''),
    'sistema'
  );
  v_motivo := nullif(current_setting('kora.foto_motivo', true), '');
  begin
    v_remision := nullif(
      current_setting('kora.foto_remision_id', true),
      ''
    )::uuid;
  exception when invalid_text_representation then
    v_remision := null;
  end;
  if v_remision is not null then
    select tienda_codigo into v_tienda
    from public.remisiones
    where id = v_remision;
  end if;

  insert into public.producto_foto_historial(
    producto_id, foto_url_anterior, foto_url_nueva, accion, origen,
    remision_id, tienda_codigo, motivo, usuario_id
  ) values (
    new.id, v_anterior, v_nueva, v_accion, v_origen,
    v_remision, v_tienda, v_motivo, auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists productos_auditar_foto on public.productos;
create trigger productos_auditar_foto
after insert or update of foto_url on public.productos
for each row execute function public.auditar_foto_producto();

create or replace function public.impedir_edicion_producto_foto_historial()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Los registros del historial de fotos son inmutables';
end;
$$;

drop trigger if exists producto_foto_historial_inmutable
  on public.producto_foto_historial;
create trigger producto_foto_historial_inmutable
before update or delete on public.producto_foto_historial
for each row execute function public.impedir_edicion_producto_foto_historial();

alter table public.producto_foto_historial enable row level security;
drop policy if exists producto_foto_historial_central_select
  on public.producto_foto_historial;
create policy producto_foto_historial_central_select
on public.producto_foto_historial for select to authenticated
using (coalesce(public.es_central(), false));
revoke all on public.producto_foto_historial from public, anon;
revoke insert, update, delete on public.producto_foto_historial from authenticated;
grant select on public.producto_foto_historial to authenticated;

create or replace function public.registrar_foto_producto_recepcion(
  p_remision_id uuid,
  p_producto_id uuid,
  p_foto_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_perfil public.perfiles%rowtype;
  v_remision public.remisiones%rowtype;
  v_producto public.productos%rowtype;
  v_path text;
begin
  select * into v_perfil
  from public.perfiles
  where id = auth.uid() and activo = true;
  if not found or v_perfil.rol <> 'admin_tienda' then
    raise exception 'Solo la tienda receptora puede cargar esta foto';
  end if;

  select * into v_remision
  from public.remisiones
  where id = p_remision_id
  for update;
  if not found then
    raise exception 'Remisión no encontrada';
  end if;
  if v_remision.tienda_codigo <> v_perfil.tienda_codigo then
    raise exception 'La remisión no pertenece a esta tienda';
  end if;
  if v_remision.estado <> 'despachada' then
    raise exception 'La remisión no está pendiente de recepción';
  end if;
  if not exists (
    select 1
    from public.remision_items
    where remision_id = p_remision_id
      and producto_id = p_producto_id
  ) then
    raise exception 'El producto no pertenece a la remisión';
  end if;

  select * into v_producto
  from public.productos
  where id = p_producto_id
  for update;
  if not found then
    raise exception 'Producto no encontrado';
  end if;
  if nullif(btrim(coalesce(v_producto.foto_url, '')), '') is not null then
    raise exception 'La referencia exacta ya tiene una imagen válida';
  end if;

  v_path := 'canonicas/' || p_producto_id::text;
  if p_foto_url is null
     or p_foto_url not like '%/storage/v1/object/public/productos-fotos/' || v_path then
    raise exception 'La URL no corresponde a la ruta canónica del producto';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'productos-fotos' and name = v_path
  ) then
    raise exception 'La imagen canónica no existe en Storage';
  end if;

  perform set_config('kora.foto_origen', 'recepcion', true);
  perform set_config('kora.foto_remision_id', p_remision_id::text, true);
  perform set_config('kora.foto_motivo', 'Carga durante recepción', true);
  update public.productos
  set foto_url = p_foto_url
  where id = p_producto_id;

  return jsonb_build_object(
    'ok', true, 'producto_id', p_producto_id, 'foto_url', p_foto_url
  );
end;
$$;

create or replace function public.gestionar_foto_producto_central(
  p_producto_id uuid,
  p_foto_url text,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_perfil public.perfiles%rowtype;
  v_producto public.productos%rowtype;
  v_path text;
begin
  select * into v_perfil
  from public.perfiles
  where id = auth.uid() and activo = true;
  if not found or v_perfil.rol not in ('gerencia', 'auditoria') then
    raise exception 'Solo Oscar o Maythe pueden gestionar fotos';
  end if;

  select * into v_producto
  from public.productos
  where id = p_producto_id
  for update;
  if not found then
    raise exception 'Producto no encontrado';
  end if;

  v_path := 'canonicas/' || p_producto_id::text;
  if p_foto_url is not null then
    if p_foto_url not like '%/storage/v1/object/public/productos-fotos/' || v_path then
      raise exception 'La URL no corresponde a la ruta canónica del producto';
    end if;
    if not exists (
      select 1 from storage.objects
      where bucket_id = 'productos-fotos' and name = v_path
    ) then
      raise exception 'La imagen canónica no existe en Storage';
    end if;
  end if;

  perform set_config('kora.foto_origen', 'catalogo', true);
  perform set_config('kora.foto_remision_id', '', true);
  perform set_config(
    'kora.foto_motivo',
    coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'Gestión central'),
    true
  );
  update public.productos
  set foto_url = nullif(btrim(coalesce(p_foto_url, '')), '')
  where id = p_producto_id;

  return jsonb_build_object(
    'ok', true, 'producto_id', p_producto_id, 'foto_url',
    nullif(btrim(coalesce(p_foto_url, '')), '')
  );
end;
$$;

drop policy if exists productos_fotos_insert_recepcion on storage.objects;
create policy productos_fotos_insert_recepcion
on storage.objects for insert to authenticated
with check (
  bucket_id = 'productos-fotos'
  and (storage.foldername(name))[1] = 'canonicas'
  and array_length(storage.foldername(name), 1) = 1
  and name ~ '^canonicas/[0-9a-f-]{36}$'
  and exists (
    select 1
    from public.perfiles perfil
    join public.remisiones remision
      on remision.tienda_codigo = perfil.tienda_codigo
     and remision.estado = 'despachada'
    join public.remision_items item
      on item.remision_id = remision.id
     and item.producto_id::text = storage.filename(name)
    join public.productos producto
      on producto.id = item.producto_id
    where perfil.id = auth.uid()
      and perfil.activo = true
      and perfil.rol = 'admin_tienda'
      and producto.foto_url is null
  )
);

revoke all on function public.registrar_foto_producto_recepcion(uuid, uuid, text)
  from public, anon;
grant execute on function public.registrar_foto_producto_recepcion(uuid, uuid, text)
  to authenticated;
revoke all on function public.gestionar_foto_producto_central(uuid, text, text)
  from public, anon;
grant execute on function public.gestionar_foto_producto_central(uuid, text, text)
  to authenticated;
revoke all on function public.auditar_foto_producto()
  from public, anon, authenticated;
revoke all on function public.impedir_edicion_producto_foto_historial()
  from public, anon, authenticated;

commit;

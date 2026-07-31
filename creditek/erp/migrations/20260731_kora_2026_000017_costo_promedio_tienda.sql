begin;

create table if not exists public.costo_promedio_tienda_historial (
  id uuid primary key default gen_random_uuid(),
  tienda_codigo text not null references public.origenes(codigo),
  producto_id uuid not null references public.productos(id),
  tipo_inventario text not null check (tipo_inventario in ('cantidad', 'serializado')),
  existencias_anteriores integer not null check (existencias_anteriores >= 0),
  unidades_entrada integer not null check (unidades_entrada > 0),
  existencias_nuevas integer not null check (existencias_nuevas > 0),
  costo_anterior numeric not null check (costo_anterior >= 0),
  costo_entrada numeric not null check (costo_entrada >= 0),
  costo_nuevo numeric not null check (costo_nuevo >= 0),
  origen_tipo text not null check (origen_tipo in ('remision', 'traslado')),
  origen_id text not null,
  usuario_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists costo_promedio_tienda_historial_busqueda_idx
  on public.costo_promedio_tienda_historial
  (tienda_codigo, producto_id, created_at desc);

alter table public.costo_promedio_tienda_historial enable row level security;

create or replace function public.bloquear_costo_promedio_tienda_historial()
returns trigger
language plpgsql
as $$
begin
  raise exception 'El historial de costo promedio es inmutable';
end;
$$;

drop trigger if exists costo_promedio_tienda_historial_inmutable
  on public.costo_promedio_tienda_historial;
create trigger costo_promedio_tienda_historial_inmutable
before update or delete on public.costo_promedio_tienda_historial
for each row execute function public.bloquear_costo_promedio_tienda_historial();

drop policy if exists costo_promedio_tienda_historial_lectura on public.costo_promedio_tienda_historial;
create policy costo_promedio_tienda_historial_lectura
on public.costo_promedio_tienda_historial
for select to authenticated
using (
  public.es_central()
  or tienda_codigo = public.tienda_actual()
);

create or replace function public.aplicar_costo_promedio_tienda(
  p_tienda_codigo text,
  p_producto_id uuid,
  p_cantidad_entrada integer,
  p_costo_interno_entrada numeric,
  p_costo_tienda_entrada numeric,
  p_tipo_inventario text,
  p_origen_tipo text,
  p_origen_id text,
  p_unidad_id uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existencias_anteriores integer := 0;
  v_costo_anterior numeric := 0;
  v_costo_interno_anterior numeric := 0;
  v_costo_nuevo numeric;
  v_costo_interno_nuevo numeric;
  v_stock public.stock_cantidad%rowtype;
begin
  if p_cantidad_entrada <= 0
     or p_costo_tienda_entrada is null
     or p_costo_tienda_entrada < 0
     or p_costo_interno_entrada is null
     or p_costo_interno_entrada < 0 then
    raise exception 'Entrada inválida para calcular costo promedio';
  end if;
  if p_tipo_inventario not in ('cantidad', 'serializado')
     or p_origen_tipo not in ('remision', 'traslado') then
    raise exception 'Origen o tipo de inventario inválido';
  end if;

  -- La cerradura por tienda y referencia evita promedios concurrentes perdidos.
  perform pg_advisory_xact_lock(hashtextextended(p_tienda_codigo || ':' || p_producto_id::text, 0));

  if p_tipo_inventario = 'cantidad' then
    select * into v_stock
    from public.stock_cantidad
    where tienda_codigo = p_tienda_codigo
      and producto_id = p_producto_id
    for update;

    if found then
      v_existencias_anteriores := v_stock.cantidad;
      v_costo_anterior := coalesce(v_stock.precio_tienda, 0);
      v_costo_interno_anterior := coalesce(v_stock.costo_promedio, 0);
    end if;

    v_costo_nuevo := case
      when v_existencias_anteriores = 0 then p_costo_tienda_entrada
      else ((v_existencias_anteriores * v_costo_anterior)
        + (p_cantidad_entrada * p_costo_tienda_entrada))
        / (v_existencias_anteriores + p_cantidad_entrada)
    end;
    v_costo_interno_nuevo := case
      when v_existencias_anteriores = 0 then p_costo_interno_entrada
      else ((v_existencias_anteriores * v_costo_interno_anterior)
        + (p_cantidad_entrada * p_costo_interno_entrada))
        / (v_existencias_anteriores + p_cantidad_entrada)
    end;

    insert into public.stock_cantidad (
      producto_id, tienda_codigo, cantidad, costo_promedio, precio_tienda
    ) values (
      p_producto_id, p_tienda_codigo, p_cantidad_entrada,
      v_costo_interno_nuevo, v_costo_nuevo
    )
    on conflict (producto_id, tienda_codigo) do update set
      cantidad = public.stock_cantidad.cantidad + p_cantidad_entrada,
      costo_promedio = v_costo_interno_nuevo,
      precio_tienda = v_costo_nuevo,
      updated_at = now();
  else
    if p_unidad_id is null or p_cantidad_entrada <> 1 then
      raise exception 'La entrada serializada requiere una unidad exacta';
    end if;

    select count(*)::integer, coalesce(avg(u.precio_tienda), 0)
    into v_existencias_anteriores, v_costo_anterior
    from public.unidades u
    where u.tienda_actual = p_tienda_codigo
      and u.producto_id = p_producto_id
      and u.estado = 'disponible';

    v_costo_nuevo := case
      when v_existencias_anteriores = 0 then p_costo_tienda_entrada
      else ((v_existencias_anteriores * v_costo_anterior) + p_costo_tienda_entrada)
        / (v_existencias_anteriores + 1)
    end;

    update public.unidades
    set precio_tienda = v_costo_nuevo
    where tienda_actual = p_tienda_codigo
      and producto_id = p_producto_id
      and estado = 'disponible';

    update public.unidades
    set precio_tienda = v_costo_nuevo
    where id = p_unidad_id
      and producto_id = p_producto_id;
  end if;

  insert into public.costo_promedio_tienda_historial (
    tienda_codigo, producto_id, tipo_inventario,
    existencias_anteriores, unidades_entrada, existencias_nuevas,
    costo_anterior, costo_entrada, costo_nuevo,
    origen_tipo, origen_id, usuario_id
  ) values (
    p_tienda_codigo, p_producto_id, p_tipo_inventario,
    v_existencias_anteriores, p_cantidad_entrada,
    v_existencias_anteriores + p_cantidad_entrada,
    v_costo_anterior, p_costo_tienda_entrada, v_costo_nuevo,
    p_origen_tipo, p_origen_id, auth.uid()
  );

  return v_costo_nuevo;
end;
$$;

revoke all on table public.costo_promedio_tienda_historial from anon;
revoke insert, update, delete on table public.costo_promedio_tienda_historial from authenticated;
grant select on table public.costo_promedio_tienda_historial to authenticated;
revoke all on function public.aplicar_costo_promedio_tienda(text, uuid, integer, numeric, numeric, text, text, text, uuid)
  from public, anon, authenticated;

do $$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.confirmar_recepcion_remision(uuid,jsonb)'::regprocedure)
  into v_definition;

  v_updated := replace(v_definition, $old$
        UPDATE unidades
        SET imei = v_imei_norm,
            estado = 'disponible',
            tienda_actual = v_remision.tienda_codigo
        WHERE id = v_unidad_id;
$old$, $new$
        PERFORM public.aplicar_costo_promedio_tienda(
          v_remision.tienda_codigo, v_item.producto_id, 1,
          v_item.precio_remision, v_item.precio_remision,
          'serializado', 'remision', v_remision.id::text, v_unidad_id
        );

        UPDATE unidades
        SET imei = v_imei_norm,
            estado = 'disponible',
            tienda_actual = v_remision.tienda_codigo
        WHERE id = v_unidad_id;
$new$);

  v_updated := replace(v_updated, $old$
      INSERT INTO stock_cantidad (producto_id, tienda_codigo, cantidad, costo_promedio, precio_tienda, factura_proveedor_id)
      VALUES (v_item.producto_id, v_remision.tienda_codigo, v_cantidad_recibida, v_item.precio_remision, v_item.precio_remision, v_item.factura_proveedor_id)
      ON CONFLICT (producto_id, tienda_codigo) DO UPDATE SET
        costo_promedio = CASE
          WHEN stock_cantidad.cantidad + v_cantidad_recibida = 0 THEN stock_cantidad.costo_promedio
          ELSE ((stock_cantidad.cantidad * stock_cantidad.costo_promedio) + (v_cantidad_recibida * v_item.precio_remision)) / (stock_cantidad.cantidad + v_cantidad_recibida)
        END,
        precio_tienda = v_item.precio_remision,
        factura_proveedor_id = v_item.factura_proveedor_id,
        cantidad = stock_cantidad.cantidad + v_cantidad_recibida,
        updated_at = now();
$old$, $new$
      IF v_cantidad_recibida > 0 THEN
        PERFORM public.aplicar_costo_promedio_tienda(
          v_remision.tienda_codigo, v_item.producto_id, v_cantidad_recibida,
          v_item.precio_remision, v_item.precio_remision,
          'cantidad', 'remision', v_remision.id::text
        );
      END IF;

      UPDATE public.stock_cantidad
      SET factura_proveedor_id = v_item.factura_proveedor_id
      WHERE producto_id = v_item.producto_id
        AND tienda_codigo = v_remision.tienda_codigo;
$new$);

  if v_updated = v_definition then
    raise exception 'No se encontró el bloque esperado de confirmar_recepcion_remision';
  end if;
  execute v_updated;
end;
$$;

do $$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.ejecutar_traslado_recepcion(uuid)'::regprocedure)
  into v_definition;

  v_updated := replace(v_definition, $old$
      update public.unidades
      set estado = 'disponible',
          tienda_actual = v_traslado.tienda_destino
      where id = v_item.unidad_id;
$old$, $new$
      perform public.aplicar_costo_promedio_tienda(
        v_traslado.tienda_destino, v_item.producto_id, 1,
        v_item.costo, v_item.precio_tienda,
        'serializado', 'traslado', p_traslado_id::text, v_item.unidad_id
      );

      update public.unidades
      set estado = 'disponible',
          tienda_actual = v_traslado.tienda_destino
      where id = v_item.unidad_id;
$new$);

  v_updated := replace(v_updated, $old$
      insert into public.stock_cantidad (
        producto_id,
        tienda_codigo,
        cantidad,
        costo_promedio,
        precio_tienda
      )
      values (
        v_item.producto_id,
        v_traslado.tienda_destino,
        v_item.cantidad,
        v_item.costo,
        v_item.precio_tienda
      )
      on conflict (producto_id, tienda_codigo)
      do update
      set costo_promedio = case
            when public.stock_cantidad.cantidad + v_item.cantidad = 0
              then public.stock_cantidad.costo_promedio
            else (
              (
                public.stock_cantidad.cantidad
                * public.stock_cantidad.costo_promedio
              )
              + (v_item.cantidad * v_item.costo)
            ) / (
              public.stock_cantidad.cantidad + v_item.cantidad
            )
          end,
          precio_tienda = v_item.precio_tienda,
          cantidad = public.stock_cantidad.cantidad + v_item.cantidad,
          updated_at = now();
$old$, $new$
      perform public.aplicar_costo_promedio_tienda(
        v_traslado.tienda_destino, v_item.producto_id, v_item.cantidad,
        v_item.costo, v_item.precio_tienda,
        'cantidad', 'traslado', p_traslado_id::text
      );
$new$);

  if v_updated = v_definition then
    raise exception 'No se encontró el bloque esperado de ejecutar_traslado_recepcion';
  end if;
  execute v_updated;
end;
$$;

commit;

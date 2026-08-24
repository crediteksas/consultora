begin;

-- KORA-2026-000038 · Ajustes auditables e inventario inicial para tiendas.
-- CENTRAL queda fuera deliberadamente porque sus accesorios dependen de lotes
-- ligados a facturas de proveedor.

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.movimientos'::regclass
      and c.contype = 'c'
      and c.conkey = array[(
        select a.attnum
        from pg_attribute a
        where a.attrelid = 'public.movimientos'::regclass
          and a.attname = 'tipo'
      )]::smallint[]
      and pg_get_constraintdef(c.oid) ~* '\mtipo\M'
  loop
    execute format('alter table public.movimientos drop constraint %I', v_constraint.conname);
  end loop;
end;
$$;

alter table public.movimientos
  add constraint movimientos_tipo_check check (tipo in (
    'compra_entrada', 'remision_entrada', 'remision_salida_central',
    'traslado_salida', 'venta', 'ajuste_entrada', 'ajuste_salida',
    'carga_inicial'
  ));

create or replace function public.inventario_registrar_ajuste(
  p_tienda_codigo text,
  p_producto_id uuid,
  p_cantidad integer,
  p_motivo text,
  p_unidad_id uuid default null,
  p_costo numeric default null,
  p_estado text default null,
  p_tienda_destino text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_perfil public.perfiles%rowtype;
  v_producto public.productos%rowtype;
  v_unidad public.unidades%rowtype;
  v_stock public.stock_cantidad%rowtype;
  v_referencia uuid := gen_random_uuid();
  v_tipo_movimiento text;
  v_cantidad_movimiento integer;
  v_costo_movimiento numeric;
begin
  select * into v_perfil
  from public.perfiles
  where id = auth.uid() and activo = true;

  if not found or v_perfil.rol not in ('gerencia', 'auditoria') then
    raise exception 'Solo gerencia o auditoria pueden ajustar inventario';
  end if;
  if p_tienda_codigo = 'CENTRAL' then
    raise exception 'Ajustes de Bodega Central no están soportados todavía — repórtalo como incidencia aparte';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'El motivo es obligatorio y debe tener mínimo 5 caracteres';
  end if;
  if p_costo is not null and p_costo < 0 then
    raise exception 'El costo no puede ser negativo';
  end if;

  perform 1 from public.origenes
  where codigo = p_tienda_codigo and activo = true and tipo <> 'central';
  if not found then
    raise exception 'La tienda indicada no existe o está inactiva';
  end if;

  select * into v_producto from public.productos where id = p_producto_id;
  if not found then raise exception 'Producto no encontrado'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_tienda_codigo || ':' || p_producto_id::text, 0)
  );

  if v_producto.tipo = 'cantidad' then
    if p_unidad_id is not null or p_estado is not null or p_tienda_destino is not null then
      raise exception 'Un accesorio no acepta unidad, estado ni tienda destino';
    end if;
    if p_cantidad is null or p_cantidad = 0 then
      raise exception 'La cantidad del ajuste debe ser distinta de cero';
    end if;

    select * into v_stock from public.stock_cantidad
    where producto_id = p_producto_id and tienda_codigo = p_tienda_codigo
    for update;

    if p_cantidad < 0 and coalesce(v_stock.cantidad, 0) < abs(p_cantidad) then
      raise exception 'El ajuste dejaría el inventario en negativo';
    end if;

    if found then
      update public.stock_cantidad
      set cantidad = cantidad + p_cantidad,
          costo_promedio = case
            when p_costo is null or p_cantidad < 0 then costo_promedio
            when cantidad + p_cantidad = 0 then p_costo
            else ((cantidad * coalesce(costo_promedio, 0)) + (p_cantidad * p_costo))
              / (cantidad + p_cantidad)
          end,
          updated_at = now()
      where producto_id = p_producto_id and tienda_codigo = p_tienda_codigo;
      v_costo_movimiento := coalesce(p_costo, v_stock.costo_promedio, 0);
    else
      if p_cantidad < 0 then raise exception 'No existe stock para aplicar la salida'; end if;
      insert into public.stock_cantidad (
        producto_id, tienda_codigo, cantidad, costo_promedio, precio_tienda
      ) values (
        p_producto_id, p_tienda_codigo, p_cantidad, coalesce(p_costo, 0), 0
      );
      v_costo_movimiento := coalesce(p_costo, 0);
    end if;

    v_tipo_movimiento := case when p_cantidad > 0 then 'ajuste_entrada' else 'ajuste_salida' end;
    v_cantidad_movimiento := abs(p_cantidad);
    insert into public.movimientos (
      tipo, tienda_codigo, producto_id, cantidad, costo,
      referencia_tipo, referencia_id, usuario, nota
    ) values (
      v_tipo_movimiento, p_tienda_codigo, p_producto_id,
      v_cantidad_movimiento, v_costo_movimiento,
      'ajuste_manual', v_referencia::text, auth.uid(), btrim(p_motivo)
    );
  elsif v_producto.tipo = 'serializado' then
    if p_unidad_id is null then raise exception 'El ajuste serializado requiere una unidad'; end if;
    if p_estado is null and p_tienda_destino is null then
      raise exception 'Nada que ajustar: indica estado o tienda destino';
    end if;
    if p_estado is not null and p_estado not in (
      'disponible', 'vendido', 'en_traslado', 'garantia_proveedor', 'en_oscar', 'anulado_reingreso'
    ) then
      raise exception 'Estado de unidad inválido: %', p_estado;
    end if;
    if p_tienda_destino = 'CENTRAL' then
      raise exception 'Ajustes de Bodega Central no están soportados todavía — repórtalo como incidencia aparte';
    end if;
    if p_tienda_destino is not null then
      perform 1 from public.origenes
      where codigo = p_tienda_destino and activo = true and tipo <> 'central';
      if not found then raise exception 'La tienda destino no existe o está inactiva'; end if;
    end if;

    select * into v_unidad from public.unidades
    where id = p_unidad_id and producto_id = p_producto_id
    for update;
    if not found then raise exception 'Unidad no encontrada para el producto indicado'; end if;
    if v_unidad.tienda_actual <> p_tienda_codigo then
      raise exception 'La unidad no pertenece a la tienda indicada';
    end if;

    update public.unidades
    set estado = coalesce(p_estado, estado),
        tienda_actual = coalesce(p_tienda_destino, tienda_actual),
        costo_remision = coalesce(p_costo, costo_remision)
    where id = p_unidad_id;

    insert into public.movimientos (
      tipo, tienda_codigo, producto_id, unidad_id, cantidad, costo,
      referencia_tipo, referencia_id, usuario, nota
    ) values (
      'ajuste_entrada', coalesce(p_tienda_destino, p_tienda_codigo),
      p_producto_id, p_unidad_id, 1, coalesce(p_costo, v_unidad.costo_remision, 0),
      'ajuste_manual', v_referencia::text, auth.uid(), btrim(p_motivo)
    );
  else
    raise exception 'Tipo de producto no soportado: %', v_producto.tipo;
  end if;

  return jsonb_build_object('ok', true, 'referencia_id', v_referencia);
end;
$$;

create or replace function public.inventario_cargar_inicial(
  p_tienda_codigo text,
  p_producto_id uuid,
  p_costo numeric,
  p_precio_tienda numeric,
  p_motivo text,
  p_cantidad integer default null,
  p_imeis text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_perfil public.perfiles%rowtype;
  v_producto public.productos%rowtype;
  v_stock public.stock_cantidad%rowtype;
  v_referencia uuid := gen_random_uuid();
  v_imei text;
  v_unidad_id uuid;
  v_total integer := 0;
begin
  select * into v_perfil from public.perfiles
  where id = auth.uid() and activo = true;
  if not found or v_perfil.rol not in ('gerencia', 'auditoria') then
    raise exception 'Solo gerencia o auditoria pueden cargar inventario inicial';
  end if;
  if p_tienda_codigo = 'CENTRAL' then
    raise exception 'Ajustes de Bodega Central no están soportados todavía — repórtalo como incidencia aparte';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'El motivo es obligatorio y debe tener mínimo 5 caracteres';
  end if;
  if p_costo is null or p_costo < 0 then raise exception 'El costo es obligatorio y no puede ser negativo'; end if;
  if p_precio_tienda is null or p_precio_tienda <= 0 then raise exception 'El precio de tienda es obligatorio y debe ser mayor que cero'; end if;

  perform 1 from public.origenes
  where codigo = p_tienda_codigo and activo = true and tipo <> 'central';
  if not found then raise exception 'La tienda indicada no existe o está inactiva'; end if;
  select * into v_producto from public.productos where id = p_producto_id;
  if not found then raise exception 'Producto no encontrado'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_tienda_codigo || ':' || p_producto_id::text, 0)
  );

  if v_producto.tipo = 'cantidad' then
    if p_cantidad is null or p_cantidad <= 0 then raise exception 'La cantidad inicial debe ser mayor que cero'; end if;
    if coalesce(array_length(p_imeis, 1), 0) > 0 then raise exception 'Un accesorio no acepta IMEIs'; end if;
    select * into v_stock from public.stock_cantidad
    where producto_id = p_producto_id and tienda_codigo = p_tienda_codigo
    for update;
    insert into public.stock_cantidad (
      producto_id, tienda_codigo, cantidad, costo_promedio, precio_tienda
    ) values (
      p_producto_id, p_tienda_codigo, p_cantidad, p_costo, p_precio_tienda
    ) on conflict (producto_id, tienda_codigo) do update set
      costo_promedio = ((public.stock_cantidad.cantidad * coalesce(public.stock_cantidad.costo_promedio, 0))
        + (p_cantidad * p_costo)) / (public.stock_cantidad.cantidad + p_cantidad),
      precio_tienda = ((public.stock_cantidad.cantidad * coalesce(public.stock_cantidad.precio_tienda, 0))
        + (p_cantidad * p_precio_tienda)) / (public.stock_cantidad.cantidad + p_cantidad),
      cantidad = public.stock_cantidad.cantidad + p_cantidad,
      updated_at = now();
    insert into public.movimientos (
      tipo, tienda_codigo, producto_id, cantidad, costo, precio,
      referencia_tipo, referencia_id, usuario, nota
    ) values (
      'carga_inicial', p_tienda_codigo, p_producto_id, p_cantidad, p_costo, p_precio_tienda,
      'carga_inicial', v_referencia::text, auth.uid(), btrim(p_motivo)
    );
    v_total := p_cantidad;
  elsif v_producto.tipo = 'serializado' then
    if p_cantidad is not null then raise exception 'Un celular se carga mediante IMEIs, no cantidad'; end if;
    if coalesce(array_length(p_imeis, 1), 0) = 0 then raise exception 'Debes indicar al menos un IMEI real'; end if;
    if exists (
      select 1 from unnest(p_imeis) i
      where length(btrim(coalesce(i, ''))) < 6
    ) then raise exception 'Todos los IMEIs deben tener mínimo 6 caracteres'; end if;
    if (select count(*) from unnest(p_imeis)) <> (select count(distinct btrim(i)) from unnest(p_imeis) i) then
      raise exception 'La lista contiene IMEIs duplicados';
    end if;
    if exists (select 1 from public.unidades u where u.imei = any(p_imeis)) then
      raise exception 'Uno o más IMEIs ya existen en inventario';
    end if;

    foreach v_imei in array p_imeis loop
      insert into public.unidades (
        producto_id, imei, estado, tienda_actual, costo_remision, precio_tienda
      ) values (
        p_producto_id, btrim(v_imei), 'disponible', p_tienda_codigo, p_costo, p_precio_tienda
      ) returning id into v_unidad_id;
      insert into public.movimientos (
        tipo, tienda_codigo, producto_id, unidad_id, cantidad, costo, precio,
        referencia_tipo, referencia_id, usuario, nota
      ) values (
        'carga_inicial', p_tienda_codigo, p_producto_id, v_unidad_id, 1,
        p_costo, p_precio_tienda, 'carga_inicial', v_referencia::text,
        auth.uid(), btrim(p_motivo)
      );
      v_total := v_total + 1;
    end loop;
  else
    raise exception 'Tipo de producto no soportado: %', v_producto.tipo;
  end if;

  return jsonb_build_object('ok', true, 'referencia_id', v_referencia, 'cantidad', v_total);
end;
$$;

revoke all on function public.inventario_registrar_ajuste(text, uuid, integer, text, uuid, numeric, text, text)
  from public, anon;
grant execute on function public.inventario_registrar_ajuste(text, uuid, integer, text, uuid, numeric, text, text)
  to authenticated;
revoke all on function public.inventario_cargar_inicial(text, uuid, numeric, numeric, text, integer, text[])
  from public, anon;
grant execute on function public.inventario_cargar_inicial(text, uuid, numeric, numeric, text, integer, text[])
  to authenticated;

commit;

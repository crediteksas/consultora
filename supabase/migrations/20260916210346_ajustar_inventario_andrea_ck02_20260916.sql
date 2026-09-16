-- Ajuste puntual solicitado para el inventario de Andrea en Móvil Shopping
-- (CK-02). No modifica ventas, cierres ni inventarios de otras tiendas.
-- Cada bloque tiene marcador de auditoría para que una repetición no vuelva a
-- fijar cantidades después de ventas posteriores.

begin;

select set_config('kora.conteo_ajuste', 'si', true);

do $$
declare
  v_actor constant text := '6de0ad26-64af-4966-8cd9-d468880af627';
  v_tienda constant text := 'CK-02';
  v_producto uuid;
  v_antes jsonb;
  v_despues jsonb;
begin
  if not exists (
    select 1
    from public.audit_log
    where accion = 'inventario_ajuste_solicitado_20260916'
      and registro_id = 'CK-02:2GE0201'
  ) then
    select id into v_producto
    from public.productos
    where codigo = '2GE0201' and nombre = 'VIDRIO ANTIESPIA';

    if v_producto is null then
      raise exception 'No se encontró la referencia 2GE0201 - VIDRIO ANTIESPIA';
    end if;

    select to_jsonb(s) into v_antes
    from public.stock_cantidad s
    where s.producto_id = v_producto and s.tienda_codigo = v_tienda
    for update;

    if v_antes is null then
      raise exception 'No existe stock de VIDRIO ANTIESPIA en CK-02';
    end if;

    update public.stock_cantidad s
    set cantidad = 480,
        updated_at = clock_timestamp()
    where s.producto_id = v_producto and s.tienda_codigo = v_tienda
    returning to_jsonb(s.*) into v_despues;

    insert into public.audit_log(usuario, accion, tabla, registro_id, detalle)
    values (
      v_actor,
      'inventario_ajuste_solicitado_20260916',
      'stock_cantidad',
      'CK-02:2GE0201',
      jsonb_build_object(
        'tienda_codigo', v_tienda,
        'codigo', '2GE0201',
        'producto', 'VIDRIO ANTIESPIA',
        'motivo', 'Conteo físico 499 menos 19 unidades vendidas: saldo correcto 480',
        'antes', v_antes,
        'despues', v_despues,
        'ventas_modificadas', false,
        'otras_tiendas_modificadas', false
      )
    );
  end if;
end;
$$;

do $$
declare
  v_actor constant text := '6de0ad26-64af-4966-8cd9-d468880af627';
  v_tienda constant text := 'CK-02';
  v_producto uuid;
  v_creado boolean := false;
  v_despues jsonb;
begin
  if not exists (
    select 1
    from public.audit_log
    where accion = 'inventario_ajuste_solicitado_20260916'
      and registro_id = 'CK-02:ACG047'
  ) then
    select id into v_producto from public.productos where codigo = 'ACG047';

    if v_producto is null then
      insert into public.productos(codigo, nombre, categoria, tipo, activo)
      values ('ACG047', 'CABLE HARVIC CB-129D', 'ACC_CELULAR', 'cantidad', true)
      returning id into v_producto;
      v_creado := true;
    elsif not exists (
      select 1 from public.productos
      where id = v_producto
        and nombre = 'CABLE HARVIC CB-129D'
        and tipo = 'cantidad'
    ) then
      raise exception 'El código ACG047 ya pertenece a otra referencia';
    end if;

    if exists (
      select 1 from public.stock_cantidad
      where producto_id = v_producto and tienda_codigo = v_tienda
    ) then
      raise exception 'ACG047 ya tenía inventario en CK-02; se requiere revisión manual';
    end if;

    insert into public.stock_cantidad as s(
      producto_id, tienda_codigo, cantidad, precio_tienda, costo_promedio, updated_at
    ) values (v_producto, v_tienda, 1, 4600, 4600, clock_timestamp())
    returning to_jsonb(s.*) into v_despues;

    insert into public.audit_log(usuario, accion, tabla, registro_id, detalle)
    values (
      v_actor,
      'inventario_ajuste_solicitado_20260916',
      'stock_cantidad',
      'CK-02:ACG047',
      jsonb_build_object(
        'tienda_codigo', v_tienda,
        'codigo', 'ACG047',
        'producto', 'CABLE HARVIC CB-129D',
        'producto_creado', v_creado,
        'cantidad', 1,
        'costo_tienda', 4600,
        'costo_interno', 4600,
        'despues', v_despues,
        'ventas_modificadas', false,
        'otras_tiendas_modificadas', false
      )
    );
  end if;
end;
$$;

do $$
declare
  v_actor constant text := '6de0ad26-64af-4966-8cd9-d468880af627';
  v_tienda constant text := 'CK-02';
  v_producto uuid;
  v_creado boolean := false;
  v_despues jsonb;
begin
  if not exists (
    select 1
    from public.audit_log
    where accion = 'inventario_ajuste_solicitado_20260916'
      and registro_id = 'CK-02:2CBS001'
  ) then
    select id into v_producto from public.productos where codigo = '2CBS001';

    if v_producto is null then
      insert into public.productos(codigo, nombre, categoria, tipo, activo)
      values ('2CBS001', 'SIM TIGO SENCILLA', 'ACC_CELULAR', 'cantidad', true)
      returning id into v_producto;
      v_creado := true;
    elsif not exists (
      select 1 from public.productos
      where id = v_producto
        and nombre = 'SIM TIGO SENCILLA'
        and tipo = 'cantidad'
    ) then
      raise exception 'El código 2CBS001 ya pertenece a otra referencia';
    end if;

    if exists (
      select 1 from public.stock_cantidad
      where producto_id = v_producto and tienda_codigo = v_tienda
    ) then
      raise exception '2CBS001 ya tenía inventario en CK-02; se requiere revisión manual';
    end if;

    insert into public.stock_cantidad as s(
      producto_id, tienda_codigo, cantidad, precio_tienda, costo_promedio, updated_at
    ) values (v_producto, v_tienda, 47, 1000, 1000, clock_timestamp())
    returning to_jsonb(s.*) into v_despues;

    insert into public.audit_log(usuario, accion, tabla, registro_id, detalle)
    values (
      v_actor,
      'inventario_ajuste_solicitado_20260916',
      'stock_cantidad',
      'CK-02:2CBS001',
      jsonb_build_object(
        'tienda_codigo', v_tienda,
        'codigo', '2CBS001',
        'producto', 'SIM TIGO SENCILLA',
        'producto_creado', v_creado,
        'cantidad', 47,
        'costo_tienda', 1000,
        'costo_interno', 1000,
        'despues', v_despues,
        'ventas_modificadas', false,
        'otras_tiendas_modificadas', false
      )
    );
  end if;
end;
$$;

commit;

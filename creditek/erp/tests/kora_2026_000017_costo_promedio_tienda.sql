begin;

insert into public.origenes (codigo, nombre, tipo)
values
  ('ZZ_KORA_000017_A', 'Prueba KORA 000017 A', 'propia'),
  ('ZZ_KORA_000017_B', 'Prueba KORA 000017 B', 'propia');

insert into public.categorias_producto (codigo, nombre)
values ('ZZ_KORA_000017', 'Prueba KORA 000017');

insert into public.productos (id, codigo, nombre, categoria, tipo)
values
  ('17000000-0000-4000-8000-000000000001', 'ZZ-000017-C', 'Prueba costo cantidad', 'ZZ_KORA_000017', 'cantidad'),
  ('17000000-0000-4000-8000-000000000002', 'ZZ-000017-S', 'Prueba costo serial', 'ZZ_KORA_000017', 'serializado');

-- Primera compra, segunda compra y compras consecutivas en la tienda A.
select public.aplicar_costo_promedio_tienda(
  'ZZ_KORA_000017_A', '17000000-0000-4000-8000-000000000001',
  10, 1000, 1000, 'cantidad', 'remision', 'test-remision-1'
);
select public.aplicar_costo_promedio_tienda(
  'ZZ_KORA_000017_A', '17000000-0000-4000-8000-000000000001',
  5, 1200, 1200, 'cantidad', 'remision', 'test-remision-2'
);
select public.aplicar_costo_promedio_tienda(
  'ZZ_KORA_000017_A', '17000000-0000-4000-8000-000000000001',
  5, 1300, 1300, 'cantidad', 'remision', 'test-remision-3'
);

-- La tienda B conserva un promedio independiente.
select public.aplicar_costo_promedio_tienda(
  'ZZ_KORA_000017_B', '17000000-0000-4000-8000-000000000001',
  4, 1800, 1800, 'cantidad', 'remision', 'test-remision-b1'
);
select public.aplicar_costo_promedio_tienda(
  'ZZ_KORA_000017_B', '17000000-0000-4000-8000-000000000001',
  2, 2100, 2100, 'cantidad', 'traslado', 'test-traslado-b1'
);

-- Serializados conservan el costo individual de cada IMEI, incluso al trasladarse.
insert into public.unidades (id, producto_id, imei, estado, tienda_actual, costo_remision, precio_tienda)
values
  ('17000000-0000-4000-8000-000000000011', '17000000-0000-4000-8000-000000000002', 'ZZ00001701', 'disponible', 'ZZ_KORA_000017_A', 900, 1000),
  ('17000000-0000-4000-8000-000000000012', '17000000-0000-4000-8000-000000000002', 'ZZ00001702', 'en_traslado', 'ZZ_KORA_000017_A', 1100, 1200);

update public.unidades
set estado = 'disponible', tienda_actual = 'ZZ_KORA_000017_B'
where id = '17000000-0000-4000-8000-000000000012';

do $$
begin
  begin
    perform public.aplicar_costo_promedio_tienda(
      'ZZ_KORA_000017_A', '17000000-0000-4000-8000-000000000002',
      1, 1100, 1200, 'serializado', 'traslado', 'test-traslado-serial-prohibido',
      '17000000-0000-4000-8000-000000000012'
    );
    raise exception 'El helper aceptó incorrectamente un producto serializado';
  exception
    when others then
      if sqlerrm <> 'El costo promedio solo aplica a productos no serializados' then
        raise;
      end if;
  end;
end;
$$;

do $$
declare
  v_a numeric;
  v_b numeric;
  v_serial_1 numeric;
  v_serial_2 numeric;
  v_historial integer;
  v_venta_definition text;
begin
  select precio_tienda into v_a
  from public.stock_cantidad
  where tienda_codigo = 'ZZ_KORA_000017_A'
    and producto_id = '17000000-0000-4000-8000-000000000001';
  select precio_tienda into v_b
  from public.stock_cantidad
  where tienda_codigo = 'ZZ_KORA_000017_B'
    and producto_id = '17000000-0000-4000-8000-000000000001';

  if round(v_a, 2) <> 1125.00 then
    raise exception 'Promedio consecutivo incorrecto en tienda A: %', v_a;
  end if;
  if round(v_b, 2) <> 1900.00 then
    raise exception 'Promedio de traslado incorrecto en tienda B: %', v_b;
  end if;

  select precio_tienda into v_serial_1 from public.unidades
  where id = '17000000-0000-4000-8000-000000000011';
  select precio_tienda into v_serial_2 from public.unidades
  where id = '17000000-0000-4000-8000-000000000012';
  if v_serial_1 <> 1000 or v_serial_2 <> 1200 then
    raise exception 'Se alteró el costo individual: IMEI 1 %, IMEI 2 %', v_serial_1, v_serial_2;
  end if;

  select count(*) into v_historial
  from public.costo_promedio_tienda_historial
  where origen_id like 'test-%';
  if v_historial <> 5 then
    raise exception 'Trazabilidad incompleta: % filas', v_historial;
  end if;

  v_venta_definition := pg_get_functiondef(
    'public.aplicar_utilidad_tienda_costo_remision()'::regprocedure
  );
  if position('where u.id = new.unidad_id' in lower(v_venta_definition)) = 0 then
    raise exception 'La venta no consulta el costo individual del IMEI';
  end if;
end;
$$;

rollback;

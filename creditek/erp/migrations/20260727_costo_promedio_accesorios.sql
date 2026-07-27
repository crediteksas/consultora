begin;

do $$
begin
  if to_regclass('public.movimientos') is null
     or to_regclass('public.stock_cantidad') is null
     or to_regclass('public.productos') is null then
    raise exception 'Faltan tablas requeridas para actualizar el costo promedio';
  end if;
end;
$$;

create or replace function public.actualizar_costo_promedio_compra_accesorio()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stock_actual numeric;
  v_stock_anterior numeric;
  v_costo_anterior numeric;
  v_costo_nuevo numeric;
begin
  if not (
    new.tipo = 'compra_entrada'
    and new.referencia_tipo = 'factura_proveedor'
    and new.referencia_id is not null
    and exists (
       select 1
       from public.productos p
       where p.id = new.producto_id
         and p.tipo = 'cantidad'
    )
  ) then
    return new;
  end if;

  if new.cantidad is null or new.cantidad <= 0
     or new.costo is null or new.costo < 0 then
    raise exception 'La entrada de accesorio no tiene cantidad y costo válidos';
  end if;

  select sc.cantidad, coalesce(sc.costo_promedio, 0)
  into v_stock_actual, v_costo_anterior
  from public.stock_cantidad sc
  where sc.producto_id = new.producto_id
    and sc.tienda_codigo = new.tienda_codigo
  for update;

  if not found then
    raise exception 'La compra no actualizó el resumen de stock del accesorio';
  end if;

  v_stock_anterior := v_stock_actual - new.cantidad;
  if v_stock_anterior < 0 then
    raise exception 'La cantidad resumida es menor que la entrada registrada';
  end if;

  v_costo_nuevo := (
    (v_stock_anterior * v_costo_anterior)
    + (new.cantidad * new.costo)
  ) / nullif(v_stock_actual, 0);

  if v_costo_nuevo is null then
    raise exception 'No fue posible calcular el costo promedio del accesorio';
  end if;

  update public.stock_cantidad
  set costo_promedio = v_costo_nuevo,
      updated_at = now()
  where producto_id = new.producto_id
    and tienda_codigo = new.tienda_codigo;

  return new;
end;
$$;

drop trigger if exists zz_movimientos_costo_promedio_accesorio
  on public.movimientos;
create trigger zz_movimientos_costo_promedio_accesorio
after insert on public.movimientos
for each row execute function public.actualizar_costo_promedio_compra_accesorio();

revoke all on function public.actualizar_costo_promedio_compra_accesorio()
  from public, anon, authenticated;

commit;

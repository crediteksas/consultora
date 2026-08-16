begin;

do $$
begin
  if to_regclass('public.venta_items') is null
     or to_regclass('public.ventas') is null
     or to_regclass('public.unidades') is null
     or to_regclass('public.stock_cantidad') is null then
    raise exception 'Faltan tablas requeridas para congelar el costo de remisión';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'venta_items'
      and column_name in ('costo_congelado', 'utilidad')
    group by table_schema, table_name
    having count(*) = 2
  ) then
    raise exception 'venta_items no contiene costo_congelado y utilidad';
  end if;
end;
$$;

alter table public.venta_items
  add column if not exists costo_remision_congelado numeric
    check (costo_remision_congelado >= 0);

comment on column public.venta_items.costo_remision_congelado is
  'Costo comercial asignado a la tienda, congelado al registrar la línea de venta.';

create or replace function public.aplicar_utilidad_tienda_costo_remision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tienda_codigo text;
  v_costo_remision numeric;
begin
  if new.precio_venta is null or new.precio_venta < 0
     or new.cantidad is null or new.cantidad <= 0 then
    raise exception 'Precio de venta y cantidad deben ser válidos';
  end if;

  if tg_op = 'UPDATE' then
    v_costo_remision := coalesce(
      old.costo_remision_congelado,
      old.costo_congelado
    );
  elsif new.unidad_id is not null then
    select u.precio_tienda
    into v_costo_remision
    from public.unidades u
    where u.id = new.unidad_id
    for share;
  else
    select v.tienda_codigo
    into v_tienda_codigo
    from public.ventas v
    where v.id = new.venta_id;

    select sc.precio_tienda
    into v_costo_remision
    from public.stock_cantidad sc
    where sc.producto_id = new.producto_id
      and sc.tienda_codigo = v_tienda_codigo
    for share;
  end if;

  if v_costo_remision is null or v_costo_remision < 0 then
    raise exception 'La línea no tiene costo de remisión trazable';
  end if;

  new.costo_remision_congelado := v_costo_remision;
  new.costo_congelado := v_costo_remision;
  new.utilidad := (new.precio_venta - v_costo_remision) * new.cantidad;
  return new;
end;
$$;

drop trigger if exists zz_venta_items_utilidad_tienda
  on public.venta_items;
create trigger zz_venta_items_utilidad_tienda
before insert or update of precio_venta, cantidad,
  costo_remision_congelado, costo_congelado
on public.venta_items
for each row execute function public.aplicar_utilidad_tienda_costo_remision();

revoke all on function public.aplicar_utilidad_tienda_costo_remision()
  from public, anon, authenticated;

commit;

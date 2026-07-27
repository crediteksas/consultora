begin;

do $$
begin
  if to_regclass('public.stock_cantidad') is null
     or to_regclass('public.productos') is null then
    raise exception 'Faltan tablas requeridas para corregir el costo promedio';
  end if;
end;
$$;

create or replace function public.ponderar_costo_entrada_accesorio()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_cantidad_entrada numeric;
begin
  if new.tienda_codigo <> 'CENTRAL'
     or new.cantidad <= old.cantidad
     or new.costo_promedio is null
     or new.costo_promedio < 0
     or not exists (
       select 1
       from public.productos p
       where p.id = new.producto_id
         and p.tipo = 'cantidad'
     ) then
    return new;
  end if;

  v_cantidad_entrada := new.cantidad - old.cantidad;
  if old.cantidad = 0 or old.costo_promedio is null then
    return new;
  end if;

  -- OLD conserva el costo histórico antes de que la compra intente sustituirlo
  -- por el último costo. El UPDATE ya mantiene bloqueada esta fila.
  new.costo_promedio := (
    (old.cantidad * old.costo_promedio)
    + ((new.cantidad - old.cantidad) * new.costo_promedio)
  ) / nullif(old.cantidad + v_cantidad_entrada, 0);

  return new;
end;
$$;

drop trigger if exists stock_cantidad_ponderar_entrada_accesorio
  on public.stock_cantidad;
create trigger stock_cantidad_ponderar_entrada_accesorio
before update of cantidad, costo_promedio
on public.stock_cantidad
for each row
execute function public.ponderar_costo_entrada_accesorio();

revoke all on function public.ponderar_costo_entrada_accesorio()
  from public, anon, authenticated;

commit;

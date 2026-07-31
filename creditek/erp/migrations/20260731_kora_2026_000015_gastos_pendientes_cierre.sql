begin;

do $preflight$
begin
  if to_regclass('public.caja_diaria') is null
     or to_regclass('public.gastos') is null then
    raise exception 'Faltan tablas requeridas para proteger el cierre de caja';
  end if;
end;
$preflight$;

create or replace function public.bloquear_cierre_con_gastos_pendientes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.estado = 'cerrada'
     and (tg_op = 'INSERT' or old.estado is distinct from 'cerrada')
     and exists (
       select 1
       from public.gastos g
       where g.tienda_codigo = new.tienda_codigo
         and g.fecha = new.fecha
         and g.estado = 'registrado'
     ) then
    raise exception
      'No se puede cerrar la caja: existen gastos pendientes de aprobación';
  end if;

  return new;
end;
$$;

create or replace trigger caja_diaria_bloquear_gastos_pendientes
before insert or update of estado on public.caja_diaria
for each row
execute function public.bloquear_cierre_con_gastos_pendientes();

commit;

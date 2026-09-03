alter table public.liquidation_platforms
  drop constraint if exists liquidation_platforms_id_check;

alter table public.liquidation_platforms
  add constraint liquidation_platforms_id_check
  check (id in ('payjoy','alo','krediya','ecredit'));

insert into public.liquidation_platforms(id,nombre,activo)
values ('ecredit','eCredit',true)
on conflict(id) do update set nombre=excluded.nombre,activo=true;

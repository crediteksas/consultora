begin;

-- Caja usa la fecha de Colombia; CURRENT_DATE depende del huso UTC de Postgres.
alter table public.ventas
  alter column fecha set default ((now() at time zone 'America/Bogota')::date);

-- Una venta excepcional se contabiliza con el día en que la tienda la registró,
-- aunque Gerencia dé el visto bueno después de medianoche o al día siguiente.
create function kora_private.fecha_venta_registrada() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_creado_en timestamptz;
begin
  select creado_en into v_creado_en
    from public.ventas_autorizaciones
   where id = new.id;
  if found then
    new.fecha := (v_creado_en at time zone 'America/Bogota')::date;
  end if;
  return new;
end;
$$;
revoke all on function kora_private.fecha_venta_registrada() from public, anon, authenticated;

-- PostgreSQL ejecuta los triggers del mismo evento por orden alfabético.
-- Debe fijar la fecha antes de que caja_ciclo_ventas la valide.
create trigger a_fecha_venta_registrada
before insert on public.ventas
for each row execute function kora_private.fecha_venta_registrada();

commit;

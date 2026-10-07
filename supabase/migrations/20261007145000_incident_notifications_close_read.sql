-- Los avisos de trabajo de una incidencia terminada dejan de estar pendientes.
-- El historial se conserva; el aviso de resolución sigue sin leer hasta que
-- el reportante lo consulte, salvo cuando la incidencia ya quedó cerrada.

create or replace function kora_private.read_terminal_incident_notices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('corregido', 'cerrado', 'rechazado', 'duplicado') then
    update public.kora_notifications n
       set read_at = clock_timestamp()
     where n.incident_id = new.id
       and n.read_at is null
       and (new.status <> 'corregido' or n.type <> 'incident_resolved');
  end if;
  return null;
end;
$$;

revoke all on function kora_private.read_terminal_incident_notices() from public, anon, authenticated;

drop trigger if exists kora_incident_notices_terminal_read on public.kora_incidents;
create trigger kora_incident_notices_terminal_read
after update on public.kora_incidents
for each row
when (new.status in ('corregido', 'cerrado', 'rechazado', 'duplicado'))
execute function kora_private.read_terminal_incident_notices();

create or replace function kora_private.read_new_terminal_incident_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  incident_status text;
begin
  if new.incident_id is null then return new; end if;
  select i.status into incident_status
    from public.kora_incidents i where i.id = new.incident_id;
  if incident_status in ('cerrado', 'rechazado', 'duplicado')
     or (incident_status = 'corregido' and new.type <> 'incident_resolved') then
    new.read_at := coalesce(new.read_at, clock_timestamp());
  end if;
  return new;
end;
$$;

revoke all on function kora_private.read_new_terminal_incident_notice() from public, anon, authenticated;

drop trigger if exists kora_new_incident_notice_terminal_read on public.kora_notifications;
create trigger kora_new_incident_notice_terminal_read
before insert on public.kora_notifications
for each row
execute function kora_private.read_new_terminal_incident_notice();

update public.kora_notifications n
   set read_at = clock_timestamp()
  from public.kora_incidents i
 where n.incident_id = i.id
   and n.read_at is null
   and (i.status in ('cerrado', 'rechazado', 'duplicado')
        or (i.status = 'corregido' and n.type <> 'incident_resolved'));

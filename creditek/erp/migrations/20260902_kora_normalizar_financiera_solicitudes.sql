begin;

create or replace function public.normalizar_financiera_solicitud()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_financiera text;
begin
  if new.financiera is null or btrim(new.financiera) = '' then
    new.financiera := null;
    return new;
  end if;

  v_financiera := lower(regexp_replace(btrim(new.financiera), '[^a-zA-Z]', '', 'g'));
  new.financiera := case v_financiera
    when 'payjoy' then 'payjoy'
    when 'alocredit' then 'alocredit'
    when 'addi' then 'addi'
    when 'krediya' then 'krediya'
    else null
  end;

  if new.financiera is null then
    raise exception 'financiera_cliente_invalida';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalizar_financiera_solicitud on public.solicitudes;
create trigger trg_normalizar_financiera_solicitud
before insert or update of financiera on public.solicitudes
for each row execute function public.normalizar_financiera_solicitud();

revoke all on function public.normalizar_financiera_solicitud()
  from public, anon, authenticated;

commit;

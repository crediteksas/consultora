-- Una estrategia por mes para todas las tiendas Retail. Conserva la configuración
-- anterior solo cuando el mes tenía una única ficha por tienda (sin ambigüedad).
create table public.presupuesto_premio_mensual (
  mes date primary key check (mes = date_trunc('month', mes)::date),
  activo boolean not null default false,
  estrategia text not null default 'Premio por cumplimiento' check (length(estrategia) between 1 and 120),
  premio_tres numeric(14,2) check (premio_tres between 0 and 1000000000),
  premio_cuatro numeric(14,2) check (premio_cuatro between 0 and 1000000000),
  revision integer not null default 0,
  actualizado_por uuid not null references auth.users(id),
  actualizado_at timestamptz not null default now(),
  check (not activo or premio_tres is not null or premio_cuatro is not null)
);
alter table public.presupuesto_premio_mensual enable row level security;
revoke all on public.presupuesto_premio_mensual from public, anon, authenticated;
grant select on public.presupuesto_premio_mensual to authenticated;
create policy lectura_central on public.presupuesto_premio_mensual
  for select to authenticated using (auth.uid() is not null and public.es_central());

insert into public.presupuesto_premio_mensual
  (mes, activo, estrategia, premio_tres, premio_cuatro, revision, actualizado_por, actualizado_at)
select p.mes, p.activo, p.estrategia, p.premio_tres, p.premio_cuatro,
       p.revision, p.actualizado_por, p.actualizado_at
from public.presupuesto_premios p
where (select count(*) from public.presupuesto_premios q where q.mes = p.mes) = 1;

create table presupuestos_control_private.premios_mensuales_historial (
  id bigint generated always as identity primary key,
  mes date not null,
  antes jsonb,
  despues jsonb not null,
  actor uuid not null,
  fecha timestamptz not null default now()
);
alter table presupuestos_control_private.premios_mensuales_historial enable row level security;
revoke all on presupuestos_control_private.premios_mensuales_historial from public, anon, authenticated;

create function presupuestos_control_private.guardar_premio_mensual(
  p_mes date, p_activo boolean, p_estrategia text,
  p_premio_tres numeric, p_premio_cuatro numeric, p_revision integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare anterior public.presupuesto_premio_mensual;
        nuevo public.presupuesto_premio_mensual;
begin
  if auth.uid() is null or public.rol_actual() is distinct from 'gerencia' then
    raise exception 'Solo Gerencia puede guardar el premio mensual';
  end if;
  if p_mes is null or p_mes <> date_trunc('month', p_mes)::date
     or p_revision is null or p_revision < 0 then
    raise exception 'Mes o revisión inválidos';
  end if;
  if p_activo is null or nullif(trim(p_estrategia), '') is null
     or length(trim(p_estrategia)) > 120 then
    raise exception 'Escribe un nombre de estrategia de hasta 120 caracteres';
  end if;
  if (p_activo and p_premio_tres is null and p_premio_cuatro is null)
     or (p_premio_tres is not null and (p_premio_tres < 0 or p_premio_tres > 1000000000
         or p_premio_tres <> round(p_premio_tres, 2)))
     or (p_premio_cuatro is not null and (p_premio_cuatro < 0 or p_premio_cuatro > 1000000000
         or p_premio_cuatro <> round(p_premio_cuatro, 2))) then
    raise exception 'Ingresa al menos un premio válido en pesos, con máximo dos decimales';
  end if;
  insert into public.presupuesto_premio_mensual(mes, actualizado_por)
    values (p_mes, auth.uid()) on conflict do nothing;
  select * into anterior from public.presupuesto_premio_mensual
    where mes = p_mes for update;
  if anterior.revision <> p_revision then
    raise exception 'La estrategia cambió en otra sesión. Vuelve a generar las cartas antes de guardar';
  end if;
  update public.presupuesto_premio_mensual
    set activo = p_activo, estrategia = trim(p_estrategia),
        premio_tres = p_premio_tres, premio_cuatro = p_premio_cuatro,
        revision = revision + 1, actualizado_por = auth.uid(), actualizado_at = now()
    where mes = p_mes returning * into nuevo;
  insert into presupuestos_control_private.premios_mensuales_historial
    (mes, antes, despues, actor)
    values (p_mes, case when anterior.revision = 0 then null else to_jsonb(anterior) end,
            to_jsonb(nuevo), auth.uid());
  return to_jsonb(nuevo);
end $$;

create function public.guardar_presupuesto_premio_mensual(
  p_mes date, p_activo boolean, p_estrategia text,
  p_premio_tres numeric, p_premio_cuatro numeric, p_revision integer
) returns jsonb language sql security invoker set search_path = '' as $$
  select presupuestos_control_private.guardar_premio_mensual(
    p_mes, p_activo, p_estrategia, p_premio_tres, p_premio_cuatro, p_revision);
$$;
revoke all on function presupuestos_control_private.guardar_premio_mensual(date,boolean,text,numeric,numeric,integer),
  public.guardar_presupuesto_premio_mensual(date,boolean,text,numeric,numeric,integer)
  from public, anon, authenticated;
grant usage on schema presupuestos_control_private to authenticated;
grant execute on function presupuestos_control_private.guardar_premio_mensual(date,boolean,text,numeric,numeric,integer),
  public.guardar_presupuesto_premio_mensual(date,boolean,text,numeric,numeric,integer)
  to authenticated;

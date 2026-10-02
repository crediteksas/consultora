create table public.presupuesto_premios (
 tienda_codigo text not null references public.origenes(codigo),
 mes date not null check(mes=date_trunc('month',mes)::date),
 activo boolean not null default false,
 estrategia text not null default 'Premio por cumplimiento' check(length(estrategia) between 1 and 120),
 premio_tres numeric(14,2) check(premio_tres>=0 and premio_tres<=1000000000),
 premio_cuatro numeric(14,2) check(premio_cuatro>=0 and premio_cuatro<=1000000000),
 revision integer not null default 0,
 actualizado_por uuid not null references auth.users(id),
 actualizado_at timestamptz not null default now(),
 primary key(tienda_codigo,mes),
 check(not activo or premio_tres is not null or premio_cuatro is not null)
);
create index presupuesto_premios_actor_idx on public.presupuesto_premios(actualizado_por);
alter table public.presupuesto_premios enable row level security;
revoke all on public.presupuesto_premios from public,anon,authenticated;
grant select on public.presupuesto_premios to authenticated;
create policy lectura_central on public.presupuesto_premios for select to authenticated
 using(auth.uid() is not null and public.es_central());
create table presupuestos_control_private.premios_historial (
 id bigint generated always as identity primary key,
 tienda_codigo text not null,mes date not null,antes jsonb,despues jsonb not null,
 actor uuid not null,fecha timestamptz not null default now()
);
alter table presupuestos_control_private.premios_historial enable row level security;
revoke all on presupuestos_control_private.premios_historial from public,anon,authenticated;

create function presupuestos_control_private.guardar_premio(
 p_tienda text,p_mes date,p_activo boolean,p_estrategia text,p_premio_tres numeric,p_premio_cuatro numeric,p_revision integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare anterior public.presupuesto_premios; nuevo public.presupuesto_premios;
begin
 if auth.uid() is null or public.rol_actual() is distinct from 'gerencia'
 then raise exception 'Solo Gerencia puede guardar premios';end if;
 if p_mes is null or p_mes<>date_trunc('month',p_mes)::date or p_revision is null or p_revision<0
 then raise exception 'Mes o revisión inválidos';end if;
 if not exists(select 1 from public.origenes where codigo=p_tienda and tipo='propia' and activo)
 then raise exception 'Selecciona una tienda Retail activa';end if;
 if p_activo is null or nullif(trim(p_estrategia),'') is null or length(trim(p_estrategia))>120
 then raise exception 'Escribe un nombre de estrategia de hasta 120 caracteres';end if;
 if (p_activo and p_premio_tres is null and p_premio_cuatro is null)
 or (p_premio_tres is not null and (p_premio_tres<0 or p_premio_tres>1000000000 or p_premio_tres<>round(p_premio_tres,2)))
 or (p_premio_cuatro is not null and (p_premio_cuatro<0 or p_premio_cuatro>1000000000 or p_premio_cuatro<>round(p_premio_cuatro,2)))
 then raise exception 'Ingresa al menos un premio válido en pesos, con máximo dos decimales';end if;
 insert into public.presupuesto_premios(tienda_codigo,mes,actualizado_por)
 values(p_tienda,p_mes,auth.uid()) on conflict do nothing;
 select * into anterior from public.presupuesto_premios where tienda_codigo=p_tienda and mes=p_mes for update;
 if anterior.revision<>p_revision then raise exception 'La estrategia cambió en otra sesión. Vuelve a generar las cartas antes de guardar';end if;
 update public.presupuesto_premios set activo=p_activo,estrategia=trim(p_estrategia),premio_tres=p_premio_tres,
 premio_cuatro=p_premio_cuatro,revision=revision+1,actualizado_por=auth.uid(),actualizado_at=now()
 where tienda_codigo=p_tienda and mes=p_mes returning * into nuevo;
 insert into presupuestos_control_private.premios_historial(tienda_codigo,mes,antes,despues,actor)
 values(p_tienda,p_mes,case when anterior.revision=0 then null else to_jsonb(anterior) end,to_jsonb(nuevo),auth.uid());
 return to_jsonb(nuevo);
end $$;
create function public.guardar_presupuesto_premio(
 p_tienda text,p_mes date,p_activo boolean,p_estrategia text,p_premio_tres numeric,p_premio_cuatro numeric,p_revision integer
) returns jsonb language sql security invoker set search_path='' as $$
 select presupuestos_control_private.guardar_premio(p_tienda,p_mes,p_activo,p_estrategia,p_premio_tres,p_premio_cuatro,p_revision);
$$;
revoke all on function presupuestos_control_private.guardar_premio(text,date,boolean,text,numeric,numeric,integer),
 public.guardar_presupuesto_premio(text,date,boolean,text,numeric,numeric,integer) from public,anon,authenticated;
grant usage on schema presupuestos_control_private to authenticated;
grant execute on function presupuestos_control_private.guardar_premio(text,date,boolean,text,numeric,numeric,integer),
 public.guardar_presupuesto_premio(text,date,boolean,text,numeric,numeric,integer) to authenticated;

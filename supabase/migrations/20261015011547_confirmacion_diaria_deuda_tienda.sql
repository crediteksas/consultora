begin;
create table public.confirmaciones_deuda_tienda (
 id uuid primary key default gen_random_uuid(),
 usuario_id uuid not null references public.perfiles(id),
 tienda_codigo text not null references public.origenes(codigo),
 fecha date not null,
 saldo_sistema numeric not null,
 saldo_declarado numeric not null,
 diferencia numeric generated always as (saldo_declarado-saldo_sistema) stored,
 observacion text,
 confirmado_at timestamptz not null default now(),
 revisado_por uuid references public.perfiles(id),
 revisado_at timestamptz,
 respuesta_revision text,
 unique(usuario_id,tienda_codigo,fecha),
 check(saldo_sistema::text not in ('NaN','Infinity','-Infinity') and saldo_declarado::text not in ('NaN','Infinity','-Infinity')),
 check(saldo_sistema=saldo_declarado or length(btrim(observacion))>=5),
 check((revisado_por is null and revisado_at is null and respuesta_revision is null) or
       (revisado_por is not null and revisado_at is not null and length(btrim(respuesta_revision))>=5))
);
create index confirmaciones_deuda_revision on public.confirmaciones_deuda_tienda(fecha)
 where diferencia<>0 and revisado_at is null;
alter table public.confirmaciones_deuda_tienda enable row level security;
revoke all on public.confirmaciones_deuda_tienda from anon,authenticated;
grant select on public.confirmaciones_deuda_tienda to authenticated;
create policy confirmaciones_deuda_lectura on public.confirmaciones_deuda_tienda for select to authenticated
 using(exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo and
   (p.rol in ('gerencia','auditoria') or (p.id=usuario_id and p.rol='admin_tienda' and p.tienda_codigo=confirmaciones_deuda_tienda.tienda_codigo))));

-- La activación comienza la mañana posterior a instalar el control.
create table kora_private.confirmacion_deuda_config (id boolean primary key default true check(id), inicio date not null);
insert into kora_private.confirmacion_deuda_config(inicio) values((now() at time zone 'America/Bogota')::date+1);
alter table kora_private.confirmacion_deuda_config enable row level security;
revoke all on kora_private.confirmacion_deuda_config from public,anon,authenticated;

create function kora_private.deuda_tienda_snapshot(p_tienda text) returns jsonb
 language sql stable set search_path='' as $$
 select jsonb_build_object('saldo',coalesce(sum(case when tipo='cargo' then monto when tipo='abono' then -monto else 0 end),0),
 'version',md5(coalesce(string_agg(id::text||':'||tipo||':'||monto::text,'|' order by id),'')))
 from public.cuenta_corriente where tienda_codigo=p_tienda;
$$;
revoke all on function kora_private.deuda_tienda_snapshot(text) from public,anon,authenticated;

create function kora_private.estado_confirmacion_deuda_tienda() returns jsonb
 language plpgsql security definer set search_path='' as $$
declare p public.perfiles%rowtype; h timestamp:=clock_timestamp() at time zone 'America/Bogota';
 c public.confirmaciones_deuda_tienda%rowtype; inicio date; s jsonb;
begin
 select * into p from public.perfiles where id=auth.uid() and activo;
 if not found then raise exception 'Sesión activa requerida'; end if;
 if p.rol<>'admin_tienda' then return jsonb_build_object('aplica',false); end if;
 if p.tienda_codigo is null then raise exception 'El administrador no tiene tienda asignada'; end if;
 select cfg.inicio into inicio from kora_private.confirmacion_deuda_config cfg where id;
 select * into c from public.confirmaciones_deuda_tienda
 where usuario_id=p.id and tienda_codigo=p.tienda_codigo and fecha=h::date;
 s:=kora_private.deuda_tienda_snapshot(p.tienda_codigo);
 return s||jsonb_build_object('aplica',true,'fecha',h::date,'inicio',inicio,
 'ahora',clock_timestamp(),'limite',(h::date+time '11:00') at time zone 'America/Bogota',
 'siguiente_dia',(h::date+1)::timestamp at time zone 'America/Bogota',
 'tienda_codigo',p.tienda_codigo,'tienda_nombre',(select nombre from public.origenes where codigo=p.tienda_codigo),
 'pendiente',h::date>=inicio and c.id is null,'bloqueada',h::date>=inicio and c.id is null and h::time>=time '11:00',
 'confirmacion',case when c.id is null then null else to_jsonb(c) end);
end $$;
revoke all on function kora_private.estado_confirmacion_deuda_tienda() from public,anon;
grant execute on function kora_private.estado_confirmacion_deuda_tienda() to authenticated;
create function public.estado_confirmacion_deuda_tienda() returns jsonb language sql set search_path='' as $$
 select kora_private.estado_confirmacion_deuda_tienda(); $$;
revoke all on function public.estado_confirmacion_deuda_tienda() from public,anon;
grant execute on function public.estado_confirmacion_deuda_tienda() to authenticated;

create function kora_private.confirmar_deuda_tienda(p_id uuid,p_fecha date,p_version text,p_saldo numeric,p_observacion text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.perfiles%rowtype; c public.confirmaciones_deuda_tienda%rowtype; s jsonb;
 h date:=(clock_timestamp() at time zone 'America/Bogota')::date;
begin
 select * into p from public.perfiles where id=auth.uid() and activo and rol='admin_tienda';
 if not found or p.tienda_codigo is null then raise exception 'Solo el administrador de su tienda puede confirmar'; end if;
 if p_id is null or p_fecha is distinct from h or p_saldo is null or p_saldo::text in ('NaN','Infinity','-Infinity')
 or p_saldo<>round(p_saldo,2) then raise exception 'Revisa la fecha y el saldo en pesos (máximo dos decimales)'; end if;
 if h<(select inicio from kora_private.confirmacion_deuda_config where id) then raise exception 'La confirmación diaria todavía no está activa'; end if;
 perform pg_advisory_xact_lock(hashtextextended('confirmacion-deuda:'||p.id||':'||p.tienda_codigo||':'||h,0));
 select * into c from public.confirmaciones_deuda_tienda where usuario_id=p.id and tienda_codigo=p.tienda_codigo and fecha=h;
 if found then
   if c.id=p_id and c.saldo_declarado=p_saldo and coalesce(c.observacion,'')=btrim(coalesce(p_observacion,'')) then return to_jsonb(c); end if;
   raise exception 'Ya registraste la confirmación de hoy. Actualiza la pantalla';
 end if;
 -- Evita confirmar una cifra que cambió mientras se revisaba.
 lock table public.cuenta_corriente in share mode;
 s:=kora_private.deuda_tienda_snapshot(p.tienda_codigo);
 if p_version is distinct from s->>'version' then raise exception 'La cartera cambió. Actualiza y revisa el saldo nuevo antes de confirmar'; end if;
 if p_saldo<>(s->>'saldo')::numeric and length(btrim(coalesce(p_observacion,'')))<5 then
   raise exception 'Explica la diferencia para revisión de Mayte u Óscar'; end if;
 insert into public.confirmaciones_deuda_tienda(id,usuario_id,tienda_codigo,fecha,saldo_sistema,saldo_declarado,observacion)
 values(p_id,p.id,p.tienda_codigo,h,(s->>'saldo')::numeric,p_saldo,nullif(btrim(p_observacion),'')) returning * into c;
 return to_jsonb(c);
end $$;
revoke all on function kora_private.confirmar_deuda_tienda(uuid,date,text,numeric,text) from public,anon;
grant execute on function kora_private.confirmar_deuda_tienda(uuid,date,text,numeric,text) to authenticated;
create function public.confirmar_deuda_tienda(p_id uuid,p_fecha date,p_version text,p_saldo numeric,p_observacion text default null)
 returns jsonb language sql set search_path='' as $$ select kora_private.confirmar_deuda_tienda($1,$2,$3,$4,$5); $$;
revoke all on function public.confirmar_deuda_tienda(uuid,date,text,numeric,text) from public,anon;
grant execute on function public.confirmar_deuda_tienda(uuid,date,text,numeric,text) to authenticated;

create function kora_private.revisar_confirmacion_deuda(p_id uuid,p_respuesta text) returns void
 language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.perfiles where id=auth.uid() and activo and rol in ('gerencia','auditoria')) then raise exception 'Solo Gestión o Gerencia puede revisar'; end if;
 if length(btrim(coalesce(p_respuesta,'')))<5 then raise exception 'Describe el resultado de la revisión'; end if;
 update public.confirmaciones_deuda_tienda set revisado_por=auth.uid(),revisado_at=now(),respuesta_revision=btrim(p_respuesta)
 where id=p_id and diferencia<>0 and revisado_at is null;
 if not found then raise exception 'Diferencia no encontrada o ya revisada'; end if;
end $$;
revoke all on function kora_private.revisar_confirmacion_deuda(uuid,text) from public,anon;
grant execute on function kora_private.revisar_confirmacion_deuda(uuid,text) to authenticated;
create function public.revisar_confirmacion_deuda(p_id uuid,p_respuesta text) returns void language sql set search_path='' as $$
 select kora_private.revisar_confirmacion_deuda($1,$2); $$;
revoke all on function public.revisar_confirmacion_deuda(uuid,text) from public,anon;
grant execute on function public.revisar_confirmacion_deuda(uuid,text) to authenticated;

-- Protección de escrituras de la API, incluso desde pestañas abiertas antes de las 11.
-- Las lecturas siguen disponibles para consultar la deuda y recuperar la sesión.
create function kora_private.exigir_confirmacion_deuda_api() returns void
 language plpgsql security definer set search_path='' as $$
declare p public.perfiles%rowtype; h timestamp:=clock_timestamp() at time zone 'America/Bogota';
 ruta text:=ltrim(coalesce(current_setting('request.path',true),''),'/');
begin
 if auth.uid() is null or h::time<time '11:00' or h::date<(select inicio from kora_private.confirmacion_deuda_config where id) then return; end if;
 if current_setting('request.method',true) in ('GET','HEAD','OPTIONS') then return; end if;
 if ruta in ('rpc/estado_confirmacion_deuda_tienda','rpc/confirmar_deuda_tienda','rpc/es_admin_b2b','rpc/tiene_capacidad_aliados','rpc/tiene_capacidad_cartera') then return; end if;
 select * into p from public.perfiles where id=auth.uid() and activo and rol='admin_tienda';
 if not found then return; end if;
 if not exists(select 1 from public.confirmaciones_deuda_tienda where usuario_id=p.id and tienda_codigo=p.tienda_codigo and fecha=h::date) then
 raise sqlstate 'PT403' using message='Confirma la deuda de tu tienda con Creditek o reporta la diferencia para continuar.',hint='KORA_CONFIRMACION_DEUDA_PENDIENTE';
 end if;
end $$;
revoke all on function kora_private.exigir_confirmacion_deuda_api() from public;
grant usage on schema kora_private to authenticated;
create function public.kora_confirmacion_deuda_pre_request() returns void
 language sql security definer set search_path='' as $$ select kora_private.exigir_confirmacion_deuda_api(); $$;
revoke all on function public.kora_confirmacion_deuda_pre_request() from public;
grant execute on function public.kora_confirmacion_deuda_pre_request() to anon,authenticated,service_role;
-- Instalación en migración separada, después de publicar y comprobar la pantalla.
create function kora_private.listar_confirmaciones_deuda(p_fecha date) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.perfiles where id=auth.uid() and activo and rol in ('gerencia','auditoria')) then raise exception 'Solo Gestión o Gerencia puede consultar'; end if;
 return jsonb_build_object('diarias',(select coalesce(jsonb_agg(jsonb_build_object(
 'usuario_id',p.id,'administrador',p.nombre,'tienda',o.nombre,'fecha',p_fecha,'confirmacion',to_jsonb(c)) order by o.nombre,p.nombre),'[]'::jsonb)
 from public.perfiles p join public.origenes o on o.codigo=p.tienda_codigo
 left join public.confirmaciones_deuda_tienda c on c.usuario_id=p.id and c.tienda_codigo=p.tienda_codigo and c.fecha=p_fecha
 where p.activo and p.rol='admin_tienda' and o.activo),
 'diferencias',(select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('administrador',p.nombre,'tienda',o.nombre) order by c.confirmado_at),'[]'::jsonb)
 from public.confirmaciones_deuda_tienda c join public.perfiles p on p.id=c.usuario_id join public.origenes o on o.codigo=c.tienda_codigo
 where c.diferencia<>0 and c.revisado_at is null));
end $$;
revoke all on function kora_private.listar_confirmaciones_deuda(date) from public,anon;
grant execute on function kora_private.listar_confirmaciones_deuda(date) to authenticated;
create function public.listar_confirmaciones_deuda(p_fecha date) returns jsonb language sql set search_path='' as $$
 select kora_private.listar_confirmaciones_deuda($1); $$;
revoke all on function public.listar_confirmaciones_deuda(date) from public,anon;
grant execute on function public.listar_confirmaciones_deuda(date) to authenticated;

notify pgrst,'reload schema';
commit;

begin;
-- Registro exclusivo del servicio. No comparte la reserva del cierre nocturno.
create table public.reportes_deuda_enviados (
 fecha date primary key,
 corte timestamptz not null,
 contenido jsonb not null,
 status text not null check(status in ('sending','sent','error','uncertain')),
 token uuid not null,
 attempts integer not null default 1,
 resultados jsonb not null default '[]',
 last_error text,
 started_at timestamptz not null default now(),
 completed_at timestamptz
);
alter table public.reportes_deuda_enviados enable row level security;
revoke all on public.reportes_deuda_enviados from public,anon,authenticated;
grant select,insert,update on public.reportes_deuda_enviados to service_role;

create function kora_private.reservar_reporte_deuda() returns jsonb
 language plpgsql security definer set search_path='' as $$
declare h timestamp:=clock_timestamp() at time zone 'America/Bogota';
 corte timestamptz; contenido jsonb; r public.reportes_deuda_enviados%rowtype;
begin
 if h::time<time '15:00' or h::time>=time '20:00'
 or h::date<(select inicio from kora_private.confirmacion_deuda_config where id) then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('reporte-deuda:'||h::date,0));
 select * into r from public.reportes_deuda_enviados where fecha=h::date for update;
 if found then
   -- Un envío interrumpido puede haber sido aceptado por Meta: no repetirlo a ciegas.
   if r.status<>'error' or r.attempts>=12 then return null; end if;
   update public.reportes_deuda_enviados set status='sending',token=gen_random_uuid(),attempts=attempts+1,
     started_at=clock_timestamp(),last_error=null where fecha=h::date returning * into r;
   return to_jsonb(r);
 end if;
 corte:=(h::date+time '15:00') at time zone 'America/Bogota';
 select jsonb_build_object('fecha',h::date,'corte',corte,'diarias',coalesce(jsonb_agg(jsonb_build_object(
   'usuario_id',p.id,'administrador',p.nombre,'tienda_codigo',p.tienda_codigo,
   'tienda',coalesce(o.nombre,p.tienda_codigo,'Sin tienda asignada'),
   'confirmacion',case when c.id is null then null else jsonb_build_object(
     'saldo_sistema',c.saldo_sistema,'saldo_declarado',c.saldo_declarado,'diferencia',c.diferencia,
     'confirmado_at',c.confirmado_at,'revisado_at',case when c.revisado_at<=corte then c.revisado_at end) end
 ) order by o.nombre,p.nombre,p.id),'[]'::jsonb)) into contenido
 from public.perfiles p left join public.origenes o on o.codigo=p.tienda_codigo
 left join public.confirmaciones_deuda_tienda c on c.usuario_id=p.id and c.tienda_codigo=p.tienda_codigo
   and c.fecha=h::date and c.confirmado_at<=corte
 where p.activo and p.rol='admin_tienda' and (o.activo or o.codigo is null);
 insert into public.reportes_deuda_enviados(fecha,corte,contenido,status,token)
 values(h::date,corte,contenido,'sending',gen_random_uuid()) returning * into r;
 return to_jsonb(r);
end $$;
revoke all on function kora_private.reservar_reporte_deuda() from public,anon,authenticated;
grant usage on schema kora_private to service_role;
grant execute on function kora_private.reservar_reporte_deuda() to service_role;
create function public.reservar_reporte_deuda() returns jsonb language sql set search_path='' as $$
 select kora_private.reservar_reporte_deuda(); $$;
revoke all on function public.reservar_reporte_deuda() from public,anon,authenticated;
grant execute on function public.reservar_reporte_deuda() to service_role;
notify pgrst,'reload schema';
commit;

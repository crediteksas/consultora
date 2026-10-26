begin;
create table public.presupuesto_whatsapp_destinos (
 tienda_codigo text primary key references public.origenes(codigo),
 perfil_id uuid not null references public.perfiles(id),
 telefono text not null unique check(telefono ~ '^573[0-9]{9}$'),
 activo boolean not null default true
);
create table public.presupuesto_whatsapp_envios (
 id uuid primary key default gen_random_uuid(), fecha date not null,
 tienda_codigo text not null references public.origenes(codigo),
 perfil_id uuid not null references public.perfiles(id), telefono text not null,
 contenido jsonb not null, estado text not null default 'pendiente'
 check(estado in ('pendiente','enviando','aceptado','error','incierto')),
 intentos int not null default 0, token uuid, intento_at timestamptz,
 meta_message_id text, last_error text, accepted_at timestamptz,
 unique(fecha,tienda_codigo)
);
alter table public.presupuesto_whatsapp_destinos enable row level security;
alter table public.presupuesto_whatsapp_envios enable row level security;
revoke all on public.presupuesto_whatsapp_destinos,public.presupuesto_whatsapp_envios from public,anon,authenticated;
grant select,insert,update on public.presupuesto_whatsapp_destinos,public.presupuesto_whatsapp_envios to service_role;

-- Private snapshot. No changes to budgets, sales, inventory, balances or authorizations.
create function public.presupuesto_whatsapp_corte(p_fecha date)
returns jsonb language sql stable security invoker set search_path='' as $$
with periodo as (select date_trunc('month',p_fecha)::date inicio,(date_trunc('month',p_fecha)+interval '1 month')::date fin),
receptores as (
 select d.*,o.nombre tienda,p.nombre administrador from public.presupuesto_whatsapp_destinos d
 join public.origenes o on o.codigo=d.tienda_codigo and o.activo and o.tipo='propia'
 join public.perfiles p on p.id=d.perfil_id and p.tienda_codigo=d.tienda_codigo and p.activo and p.rol='admin_tienda'
 where d.activo
), metas as (
 select r.tienda_codigo,count(p.fecha) dias,
 count(p.fecha) filter(where p.meta_venta_total is not null and p.meta_uds_cel is not null and p.meta_uds_acc is not null and p.meta_creditos is not null) dias_completos,
 sum(p.meta_venta_total) mensual,
 coalesce(sum(p.meta_venta_total) filter(where p.fecha<p_fecha),0) acumulada,
 sum(p.meta_venta_total) filter(where p.fecha=p_fecha) hoy,
 coalesce(sum(p.meta_creditos) filter(where p.fecha<p_fecha),0) creditos,
 coalesce(sum(p.meta_uds_cel) filter(where p.fecha<p_fecha),0) celulares,
 coalesce(sum(p.meta_uds_acc) filter(where p.fecha<p_fecha),0) accesorios
 from receptores r cross join periodo z left join public.presupuestos p
 on p.tienda_codigo=r.tienda_codigo and p.fecha>=z.inicio and p.fecha<z.fin group by r.tienda_codigo
), ventas_mes as (
 select v.* from public.ventas v cross join periodo z
 where v.fecha>=z.inicio and v.fecha<p_fecha and v.anulada is not true
), reales as (
 select r.tienda_codigo,coalesce(sum(v.total),0) ventas,
 (select count(*) from public.creditos c join ventas_mes vm on vm.id=c.venta_id where vm.tienda_codigo=r.tienda_codigo) creditos
 from receptores r left join ventas_mes v on v.tienda_codigo=r.tienda_codigo group by r.tienda_codigo
), unidades as (
 -- Business definition: celulares de contado only; accesorios across all sales.
 select r.tienda_codigo,
 coalesce(sum(i.cantidad) filter(where p.tipo='serializado' and v.tipo='contado'),0) celulares,
 coalesce(sum(i.cantidad) filter(where p.tipo='cantidad'),0) accesorios
 from receptores r left join ventas_mes v on v.tienda_codigo=r.tienda_codigo
 left join public.venta_items i on i.venta_id=v.id left join public.productos p on p.id=i.producto_id group by r.tienda_codigo
)
select coalesce(jsonb_agg(jsonb_build_object(
 'fecha',p_fecha,'corte',p_fecha-1,'tienda_codigo',r.tienda_codigo,'tienda',r.tienda,'perfil_id',r.perfil_id,'administrador',r.administrador,'telefono',r.telefono,
 'presupuesto_completo',m.dias=(z.fin-z.inicio) and m.dias_completos=(z.fin-z.inicio),
 'meta_mensual',m.mensual,'meta_acumulada',m.acumulada,'meta_hoy',m.hoy,
 'meta_creditos',m.creditos,'meta_celulares',m.celulares,'meta_accesorios',m.accesorios,
 'ventas',v.ventas,'creditos',v.creditos,'celulares',u.celulares,'accesorios',u.accesorios
) order by r.tienda_codigo),'[]'::jsonb)
from receptores r join metas m using(tienda_codigo) join reales v using(tienda_codigo) join unidades u using(tienda_codigo) cross join periodo z;
$$;
revoke all on function public.presupuesto_whatsapp_corte(date) from public,anon,authenticated;
grant execute on function public.presupuesto_whatsapp_corte(date) to service_role;

create function public.presupuesto_whatsapp_reservar()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare hoy date:=(now() at time zone 'America/Bogota')::date; hora int:=extract(hour from now() at time zone 'America/Bogota'); resultado jsonb;
begin
 -- Daily 08:00-09:55; one initial catch-up on activation day, never historical sends.
 if not (hora>=8 and hora<10 or hoy=date '2026-10-23' and hora>=8 and hora<20) then return '[]'::jsonb; end if;
 perform pg_advisory_xact_lock(hashtextextended('presupuesto-whatsapp:'||hoy::text,0));
 insert into public.presupuesto_whatsapp_envios(fecha,tienda_codigo,perfil_id,telefono,contenido)
 select hoy,x->>'tienda_codigo',(x->>'perfil_id')::uuid,x->>'telefono',x
 from jsonb_array_elements(public.presupuesto_whatsapp_corte(hoy)) x
 on conflict(fecha,tienda_codigo) do nothing;
 -- Never automatically retry an ambiguous attempt. Retain it for reconciliation.
 update public.presupuesto_whatsapp_envios set estado='incierto',last_error='envio_interrumpido_revisar_meta'
 where fecha=hoy and estado='enviando' and intento_at<now()-interval '10 minutes';
 with candidatos as (
 select e.id from public.presupuesto_whatsapp_envios e
 join public.presupuesto_whatsapp_destinos d on d.tienda_codigo=e.tienda_codigo and d.activo and d.telefono=e.telefono and d.perfil_id=e.perfil_id
 join public.origenes o on o.codigo=e.tienda_codigo and o.activo
 join public.perfiles p on p.id=e.perfil_id and p.activo and p.rol='admin_tienda' and p.tienda_codigo=e.tienda_codigo
 where e.fecha=hoy and e.estado in ('pendiente','error') and e.intentos<3
 and (e.intento_at is null or e.intento_at<now()-interval '5 minutes')
 order by e.tienda_codigo for update of e skip locked limit 9
 ), reservados as (
 update public.presupuesto_whatsapp_envios e set estado='enviando',token=gen_random_uuid(),intentos=e.intentos+1,intento_at=now()
 from candidatos c where e.id=c.id returning e.*)
 select coalesce(jsonb_agg(to_jsonb(reservados)),'[]'::jsonb) into resultado from reservados;
 return resultado;
end $$;
revoke all on function public.presupuesto_whatsapp_reservar() from public,anon,authenticated;
grant execute on function public.presupuesto_whatsapp_reservar() to service_role;
commit;

begin;

create table kora_private.rectificacion_cierre_corozal (
  id uuid primary key default gen_random_uuid(),
  cierre_id uuid not null references public.caja_diaria(id),
  efectivo_original numeric not null check (efectivo_original = 3360360),
  efectivo_corregido numeric not null check (efectivo_corregido = 2588560),
  motivo text not null,
  soporte_nombre text not null,
  soporte bytea not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','autorizada','rechazada')),
  preparado_por uuid not null,
  preparado_at timestamptz not null default now(),
  decidido_por uuid,
  decidido_at timestamptz,
  motivo_rechazo text
);
alter table kora_private.rectificacion_cierre_corozal enable row level security;
revoke all on kora_private.rectificacion_cierre_corozal from public, anon, authenticated, service_role;
create unique index rectificacion_corozal_activa
  on kora_private.rectificacion_cierre_corozal(cierre_id) where estado <> 'rechazada';

create function kora_private.exigir_actor_rectificacion_corozal(p_rol text)
returns uuid language plpgsql stable set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if not exists (
    select 1 from public.perfiles p where p.id=actor and p.activo
      and ((p.id='d1782db6-bacc-4caf-af6f-ce1b8d1c0391' and p.rol='auditoria' and p_rol in ('auditoria','lectura'))
        or (p.id='6de0ad26-64af-4966-8cd9-d468880af627' and p.rol='gerencia' and p_rol in ('gerencia','lectura')))
  ) then raise exception 'No autorizado para esta rectificación'; end if;
  return actor;
end;
$$;
revoke all on function kora_private.exigir_actor_rectificacion_corozal(text) from public, anon, authenticated, service_role;

create function kora_private.verificar_cierre_corozal()
returns uuid language plpgsql set search_path = '' as $$
declare cierre uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('caja-arrastre:CK-02',0));
  select d.id into cierre
    from public.caja_diaria d join public.caja_cortes c using(tienda_codigo,fecha)
    where d.tienda_codigo='CK-02' and d.fecha=date '2026-11-08'
      and d.estado='cerrada' and c.estado in ('validada','autorizada')
      and d.efectivo_contado=3360360 and c.efectivo_contado=3360360;
  if cierre is null
    or exists(select 1 from public.caja_diaria where tienda_codigo='CK-02' and fecha>date '2026-11-08' and estado='cerrada')
    or exists(select 1 from public.caja_cortes where tienda_codigo='CK-02' and fecha>date '2026-11-08' and estado in ('validada','autorizada'))
    or exists(select 1 from public.gastos where tienda_codigo='CK-02' and fecha=date '2026-11-08' and estado in ('registrado','aprobado'))
    or (public.caja_calcular_interno('CK-02',date '2026-11-09')->>'apertura')::numeric is distinct from 3360360
  then raise exception 'La base del cierre cambió o hay un cierre posterior. Revisa el arrastre antes de autorizar'; end if;
  return cierre;
end;
$$;
revoke all on function kora_private.verificar_cierre_corozal() from public, anon, authenticated, service_role;

create function public.preparar_rectificacion_corozal(p_motivo text,p_nombre text,p_soporte text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := kora_private.exigir_actor_rectificacion_corozal('auditoria');
  archivo bytea;
  solicitud uuid;
begin
  if length(trim(coalesce(p_motivo,''))) not between 20 and 500
    or length(coalesce(p_nombre,'')) not between 1 and 120
    or length(coalesce(p_soporte,'')) not between 1 and 2796204
  then raise exception 'Adjunta un soporte de hasta 2 MB y explica el motivo'; end if;
  archivo:=decode(p_soporte,'base64');
  if octet_length(archivo)>2097152
    or not (substring(archivo from 1 for 5)=decode('255044462d','hex')
      or substring(archivo from 1 for 8)=decode('89504e470d0a1a0a','hex')
      or substring(archivo from 1 for 3)=decode('ffd8ff','hex'))
  then raise exception 'El soporte debe ser PDF, PNG o JPEG'; end if;
  insert into kora_private.rectificacion_cierre_corozal
    (cierre_id,efectivo_original,efectivo_corregido,motivo,soporte_nombre,soporte,preparado_por)
  values (kora_private.verificar_cierre_corozal(),3360360,2588560,trim(p_motivo),p_nombre,archivo,actor)
  returning id into solicitud;
  return solicitud;
end;
$$;

create function public.listar_rectificaciones_corozal()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform kora_private.exigir_actor_rectificacion_corozal('lectura');
  return coalesce((select jsonb_agg(to_jsonb(r)-'soporte' order by preparado_at desc)
    from kora_private.rectificacion_cierre_corozal r),'[]'::jsonb);
end;
$$;

create function public.soporte_rectificacion_corozal(p_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  perform kora_private.exigir_actor_rectificacion_corozal('lectura');
  return (select encode(soporte,'base64') from kora_private.rectificacion_cierre_corozal where id=p_id);
end;
$$;

create function public.decidir_rectificacion_corozal(p_id uuid,p_aprobar boolean,p_motivo text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := kora_private.exigir_actor_rectificacion_corozal('gerencia');
  solicitud kora_private.rectificacion_cierre_corozal%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('caja-arrastre:CK-02',0));
  select * into solicitud from kora_private.rectificacion_cierre_corozal where id=p_id for update;
  if not found or solicitud.estado<>'pendiente' or solicitud.preparado_por=actor then
    raise exception 'La solicitud no está disponible para decisión';
  end if;
  if p_aprobar is true then
    if kora_private.verificar_cierre_corozal() is distinct from solicitud.cierre_id then
      raise exception 'El cierre ya no coincide';
    end if;
  elsif p_aprobar is distinct from false or length(trim(coalesce(p_motivo,''))) not between 10 and 500 then
    raise exception 'Indica el motivo del rechazo';
  end if;
  update kora_private.rectificacion_cierre_corozal
    set estado=case when p_aprobar then 'autorizada' else 'rechazada' end,
      decidido_por=actor,decidido_at=now(),motivo_rechazo=case when not p_aprobar then trim(p_motivo) end
    where id=p_id;
  if p_aprobar and (public.caja_calcular_interno('CK-02',date '2026-11-09')->>'apertura')::numeric is distinct from 2588560 then
    raise exception 'El arrastre no coincide con el valor autorizado';
  end if;
end;
$$;

revoke all on function public.preparar_rectificacion_corozal(text,text,text), public.listar_rectificaciones_corozal(),
  public.soporte_rectificacion_corozal(uuid), public.decidir_rectificacion_corozal(uuid,boolean,text)
  from public, anon, authenticated, service_role;
grant execute on function public.preparar_rectificacion_corozal(text,text,text), public.listar_rectificaciones_corozal(),
  public.soporte_rectificacion_corozal(uuid), public.decidir_rectificacion_corozal(uuid,boolean,text) to authenticated;

CREATE OR REPLACE FUNCTION public.caja_calcular_interno(p_tienda text, p_fecha date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  anterior public.caja_diaria%rowtype;
  original public.caja_diaria%rowtype;
  desde date;
  dia jsonb;
  pasado jsonb;
  registrado numeric;
  arrastre numeric;
  incorporado numeric;
  ajuste numeric;
  apertura numeric;
  cierre_corregido numeric;
  rectificacion jsonb;
begin
  select * into anterior from public.caja_diaria where tienda_codigo=p_tienda and fecha<p_fecha
    and estado='cerrada' order by fecha desc limit 1;
  select min(fecha) into desde from public.caja_diaria where tienda_codigo=p_tienda and fecha<p_fecha and estado='cerrada';
  desde:=coalesce(desde,'1900-01-01'::date);
  pasado:=public.caja_componentes_rango(p_tienda,desde,p_fecha-1);
  -- Incluye los ajustes de auditoría ya incorporados al cierre, no solo ventas/gastos.
  select coalesce(sum(c.efectivo_esperado-c.apertura),0)
    into registrado from public.caja_diaria c where c.tienda_codigo=p_tienda and c.fecha between desde and p_fecha-1 and c.estado='cerrada';
  arrastre:=(pasado->>'neto')::numeric-registrado;
  incorporado:=case when anterior.fecha=desde then 0
    else coalesce(anterior.arrastre_movimientos_incorporado,0) end;
  ajuste:=arrastre-incorporado;
  select r.efectivo_corregido into cierre_corregido
    from kora_private.rectificacion_cierre_corozal r
    where r.cierre_id=anterior.id and r.estado='autorizada';
  apertura:=coalesce(cierre_corregido,anterior.efectivo_contado,0)+ajuste;
  dia:=public.caja_componentes_rango(p_tienda,p_fecha,p_fecha);
  select * into original from public.caja_diaria where tienda_codigo=p_tienda and fecha=p_fecha;
  select jsonb_build_object('efectivo_original',r.efectivo_original,
    'efectivo_corregido',r.efectivo_corregido,'diferencia',r.efectivo_corregido-r.efectivo_original)
    into rectificacion from kora_private.rectificacion_cierre_corozal r
    where r.cierre_id=original.id and r.estado='autorizada';
  return dia || jsonb_build_object('ok',true,'tienda_codigo',p_tienda,'fecha',p_fecha,'apertura',apertura,'esperado',apertura+(dia->>'neto')::numeric,
    'apertura_cierre_anterior',coalesce(cierre_corregido,anterior.efectivo_contado,0),
    'rectificacion_cierre',rectificacion,
    'ajuste_arrastre_movimientos',ajuste,'arrastre_movimientos_total',arrastre,
    'apertura_sin_arqueo',anterior.id is null,
    'fecha_inicio_ciclo',(select fecha_inicio from public.caja_ciclo_config where id),
    'caja',case when original.id is null then null else to_jsonb(original) end);
end;
$function$
;
commit;

begin;

create or replace function kora_private.verificar_cierre_corozal()
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
    or exists(select 1 from public.gastos where tienda_codigo='CK-02' and fecha=date '2026-11-08' and estado in ('registrado','aprobado'))
    or (public.caja_calcular_interno('CK-02',date '2026-11-09')->>'apertura')::numeric is distinct from 3360360
  then raise exception 'La base del cierre cambió o ya hay gastos registrados el 8 de noviembre. Revisa el arrastre antes de autorizar'; end if;
  return cierre;
end;
$$;

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
  diferencia_rectificada numeric;
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
  -- La diferencia entra al arrastre una sola vez. Un arqueo nuevo que ya la
  -- incorpora guarda el total del arrastre, igual que para otros movimientos.
  select coalesce(sum(r.efectivo_corregido-r.efectivo_original),0)
    into diferencia_rectificada
    from kora_private.rectificacion_cierre_corozal r
    join public.caja_diaria c on c.id=r.cierre_id
    where c.tienda_codigo=p_tienda and c.fecha between desde and p_fecha-1
      and r.estado='autorizada';
  arrastre:=(pasado->>'neto')::numeric-registrado+diferencia_rectificada;
  incorporado:=case when anterior.fecha=desde then 0
    else coalesce(anterior.arrastre_movimientos_incorporado,0) end;
  ajuste:=arrastre-incorporado;
  apertura:=coalesce(anterior.efectivo_contado,0)+ajuste;
  dia:=public.caja_componentes_rango(p_tienda,p_fecha,p_fecha);
  select * into original from public.caja_diaria where tienda_codigo=p_tienda and fecha=p_fecha;
  select jsonb_build_object('efectivo_original',r.efectivo_original,
    'efectivo_corregido',r.efectivo_corregido,'diferencia',r.efectivo_corregido-r.efectivo_original)
    into rectificacion from kora_private.rectificacion_cierre_corozal r
    where r.cierre_id=original.id and r.estado='autorizada';
  return dia || jsonb_build_object('ok',true,'tienda_codigo',p_tienda,'fecha',p_fecha,'apertura',apertura,'esperado',apertura+(dia->>'neto')::numeric,
    'apertura_cierre_anterior',coalesce(anterior.efectivo_contado,0),
    'rectificacion_cierre',rectificacion,
    'ajuste_arrastre_movimientos',ajuste,'arrastre_movimientos_total',arrastre,
    'apertura_sin_arqueo',anterior.id is null,
    'fecha_inicio_ciclo',(select fecha_inicio from public.caja_ciclo_config where id),
    'caja',case when original.id is null then null else to_jsonb(original) end);
end;
$function$
;

commit;

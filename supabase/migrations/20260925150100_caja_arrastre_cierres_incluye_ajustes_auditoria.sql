-- Versión registrada en producción: 20260925150100.
-- El neto incorporado en un cierre es el efectivo esperado menos su apertura.
-- Sumar solo los componentes antiguos omitía ajustes de auditoría ya incluidos
-- en el arqueo y los agregaba otra vez a la apertura del día siguiente.
create or replace function public.caja_calcular_interno(p_tienda text,p_fecha date)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  anterior public.caja_diaria%rowtype;
  original public.caja_diaria%rowtype;
  desde date;
  dia jsonb;
  pasado jsonb;
  registrado numeric;
  arrastre numeric;
  ajuste numeric;
  apertura numeric;
begin
  select * into anterior from public.caja_diaria where tienda_codigo=p_tienda and fecha<p_fecha
    and estado='cerrada' order by fecha desc limit 1;
  select min(fecha) into desde from public.caja_diaria where tienda_codigo=p_tienda and fecha<p_fecha and estado='cerrada';
  desde:=coalesce(desde,'1900-01-01'::date);
  pasado:=public.caja_componentes_rango(p_tienda,desde,p_fecha-1);
  select coalesce(sum(c.efectivo_esperado-c.apertura),0)
    into registrado from public.caja_diaria c where c.tienda_codigo=p_tienda and c.fecha between desde and p_fecha-1 and c.estado='cerrada';
  arrastre:=(pasado->>'neto')::numeric-registrado;
  ajuste:=arrastre-coalesce(anterior.arrastre_movimientos_incorporado,0);
  apertura:=coalesce(anterior.efectivo_contado,0)+ajuste;
  dia:=public.caja_componentes_rango(p_tienda,p_fecha,p_fecha);
  select * into original from public.caja_diaria where tienda_codigo=p_tienda and fecha=p_fecha;
  return dia || jsonb_build_object('ok',true,'tienda_codigo',p_tienda,'fecha',p_fecha,'apertura',apertura,'esperado',apertura+(dia->>'neto')::numeric,
    'apertura_cierre_anterior',coalesce(anterior.efectivo_contado,0),
    'ajuste_arrastre_movimientos',ajuste,'arrastre_movimientos_total',arrastre,
    'apertura_sin_arqueo',anterior.id is null,
    'fecha_inicio_ciclo',(select fecha_inicio from public.caja_ciclo_config where id),
    'caja',case when original.id is null then null else to_jsonb(original) end);
end;
$$;
revoke all on function public.caja_calcular_interno(text,date) from public,anon,authenticated;

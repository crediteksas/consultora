-- Cada tramo empieza en el inventario físico aprobado anterior, aunque su
-- resultado no se haya guardado por separado. No modifica datos ni snapshots.
begin;
do $migration$
declare
  v_def text:=pg_get_functiondef('inventario_control.cierre_utilidad_api(text,uuid,text)'::regprocedure);
  v_old text[]:=array[
    '  v_corte inventario_control.cortes%rowtype;',
    $old$  select * into v_anterior from inventario_control.cierres_utilidad
    where tienda_codigo=v_corte.tienda_codigo order by fin_at desc limit 1;
  v_inicio:=coalesce(v_anterior.fin_at,v_origen.inventario_control_desde);
  v_fin:=v_corte.corte_at;$old$,
    '  v_inv_inicial:=v_anterior.inventario_final;',
    $old$'corte_inicio_id',v_anterior.corte_id,'origen_inicio',case when v_anterior.id is null then 'carga_inicial' else 'corte_anterior' end$old$,
    'p_corte_id,v_anterior.corte_id,v_corte.tienda_codigo,v_inicio,v_fin,v_ventas,v_costo'
  ];
  v_new text[]:=array[
    E'  v_corte inventario_control.cortes%rowtype;\n  v_corte_anterior inventario_control.cortes%rowtype;',
    $new$  v_fin:=v_corte.corte_at;
  select * into v_corte_anterior from inventario_control.cortes c
    where c.tienda_codigo=v_corte.tienda_codigo and c.corte_at<v_fin
      and c.corte_at>=v_origen.inventario_control_desde
      and c.estado in ('aplicado','sin_diferencias') and c.autorizado_at is not null
      and c.base_conteo='corte_fijo'
      and not coalesce((c.revision_fuente->>'solo_comparativo')::boolean,false)
    order by c.corte_at desc,c.id desc limit 1;
  select * into v_anterior from inventario_control.cierres_utilidad
    where corte_id=v_corte_anterior.id;
  v_inicio:=coalesce(v_corte_anterior.corte_at,v_origen.inventario_control_desde);$new$,
    $new$  v_inv_inicial:=v_anterior.inventario_final;
  if v_corte_anterior.id is not null and v_anterior.id is null then
    select case when bool_or(l.cantidad_fisica is null or
      (l.cantidad_fisica>0 and (l.costo_tienda is null or l.costo_tienda<=0))) then null
      else coalesce(sum(l.cantidad_fisica*l.costo_tienda),0) end into v_inv_inicial
      from inventario_control.lineas l where l.corte_id=v_corte_anterior.id;
  end if;$new$,
    $new$'corte_inicio_id',v_corte_anterior.id,'origen_inicio',case when v_corte_anterior.id is null then 'carga_inicial' else 'corte_anterior' end$new$,
    'p_corte_id,v_corte_anterior.id,v_corte.tienda_codigo,v_inicio,v_fin,v_ventas,v_costo'
  ];
  i integer;
begin
  if position('v_corte_anterior inventario_control.cortes%rowtype;' in v_def)>0 then
    raise exception 'La función ya contiene otra modificación de tramos; revisar antes de sustituirla';
  end if;
  for i in 1..array_length(v_old,1) loop
    if position(v_old[i] in v_def)=0 then
      raise exception 'La función de producción no coincide con la base verificada (paso %)',i;
    end if;
    v_def:=replace(v_def,v_old[i],v_new[i]);
  end loop;
  execute v_def;
end;
$migration$;
commit;

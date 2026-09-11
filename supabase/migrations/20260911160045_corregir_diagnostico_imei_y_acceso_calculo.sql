-- Sólo diagnóstico y acceso a la ruta existente. No aprueba, paga ni crea ventas.
do $migration$
declare d text; old_branch text; new_branch text;
begin
 d:=pg_get_functiondef('public.aliados_resolver_operaciones_propias(uuid)'::regprocedure);
 old_branch:=$old$if v_count=0 then
      if exists($old$;
 new_branch:=$new$if v_count=0 then
      if exists(
        select 1 from public.unidades u
        where regexp_replace(coalesce(u.imei,''),'[^0-9A-Za-z]','','g')=regexp_replace(coalesce(o.imei,''),'[^0-9A-Za-z]','','g')
          and u.tienda_actual=o.origen_codigo
      ) then
        insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion)
        values(p_liquidation_id,o.id,'imei_sin_venta_vinculada','El IMEI está en el inventario de la tienda correcta, pero no tiene una venta con crédito válido vinculada en KORA. Revisar la conciliación de esta operación sin volver a liquidarla ni duplicar el abono.',true)
        on conflict do nothing;
      elsif exists($new$;
 if strpos(d,old_branch)=0 then raise exception 'La función de conciliación cambió; revisar antes de aplicar'; end if;
 d:=replace(d,old_branch,new_branch);
 d:=replace(d,'''imei_no_existe'',''imei_duplicado'',''imei_otra_tienda'',''diferencia_inicial_sin_revisar''','''imei_no_existe'',''imei_duplicado'',''imei_otra_tienda'',''imei_sin_venta_vinculada'',''diferencia_inicial_sin_revisar''');
 execute d;
end;
$migration$;

-- Rectifica únicamente el diagnóstico abierto de lotes no aprobados.
update public.liquidation_incidents i
set tipo='imei_sin_venta_vinculada',
 descripcion='El IMEI está en el inventario de la tienda correcta, pero no tiene una venta con crédito válido vinculada en KORA. Revisar la conciliación de esta operación sin volver a liquidarla ni duplicar el abono.'
from public.liquidation_operations o, public.liquidations l
where i.operation_id=o.id and l.id=o.liquidation_id
 and i.tipo='imei_otra_tienda' and i.estado='abierta'
 and l.frozen_at is null and l.approved_at is null
 and exists(select 1 from public.unidades u where u.imei=o.imei and u.tienda_actual=o.origen_codigo)
 and not exists(select 1 from public.venta_items vi join public.ventas v on v.id=vi.venta_id
   join public.creditos c on c.venta_id=v.id join public.unidades u on u.id=vi.unidad_id
   where u.imei=o.imei and v.tienda_codigo=o.origen_codigo and not coalesce(v.anulada,false))
 and not exists(select 1 from public.liquidation_incidents x where x.operation_id=o.id
   and x.liquidation_id=l.id and x.tipo='imei_sin_venta_vinculada');

-- Mismo patrón de acceso acotado que la ruta de aprobación. No abrir kora_private.
alter function kora_private.calcular_liquidacion_sin_datos_pago(uuid)
 set schema liquidaciones_api_private;
revoke all on function liquidaciones_api_private.calcular_liquidacion_sin_datos_pago(uuid) from public,anon;
grant execute on function liquidaciones_api_private.calcular_liquidacion_sin_datos_pago(uuid) to authenticated;
create or replace function public.aliados_calcular_liquidacion(p_id uuid)
returns public.liquidations language sql security invoker set search_path='' as $$
 select liquidaciones_api_private.calcular_liquidacion_sin_datos_pago(p_id);
$$;
revoke all on function public.aliados_calcular_liquidacion(uuid) from public,anon;
grant execute on function public.aliados_calcular_liquidacion(uuid) to authenticated;
-- Conserva llamadas internas existentes, sin conceder acceso nuevo a este esquema.
create function kora_private.calcular_liquidacion_sin_datos_pago(p_id uuid)
returns public.liquidations language sql security invoker set search_path='' as $$
 select liquidaciones_api_private.calcular_liquidacion_sin_datos_pago(p_id);
$$;
revoke all on function kora_private.calcular_liquidacion_sin_datos_pago(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';

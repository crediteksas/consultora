-- La venta Retail puede registrarse después de la operación de plataforma.
-- Sólo cambia el diagnóstico: no recalcula, aprueba, paga ni crea abonos.
do $migration$
declare
 d text;
 anterior text;
 nuevo text;
begin
 d:=pg_get_functiondef('public.aliados_resolver_operaciones_propias(uuid)'::regprocedure);
 anterior:=$old$'imei_sin_venta_vinculada','El IMEI está en el inventario de la tienda correcta, pero no tiene una venta con crédito válido vinculada en KORA. Revisar la conciliación de esta operación sin volver a liquidarla ni duplicar el abono.',true$old$;
 nuevo:=$new$'imei_sin_venta_vinculada','Pendiente de conciliación Retail por IMEI, tienda y operación. La venta puede registrarse después; conservar ambas fechas. No bloquea liquidación ni aplicación del abono y no debe duplicarlo.',false$new$;
 if strpos(d,anterior)=0 then raise exception 'Cambió el diagnóstico de venta Retail; revisar migración'; end if;
 d:=replace(d,anterior,nuevo);
 anterior:=$old$'imei_no_existe','El IMEI no tiene una venta o crédito válido en KORA',true$old$;
 nuevo:=$new$'imei_no_existe','Pendiente de carga o conciliación en Retail. No se encontró inventario/venta vinculada; no bloquea liquidación ni aplicación del abono. Conservar fechas y conciliar sin duplicar movimientos.',false$new$;
 if strpos(d,anterior)=0 then raise exception 'Cambió el diagnóstico de inventario Retail; revisar migración'; end if;
 d:=replace(d,anterior,nuevo);
 execute d;
end;
$migration$;

-- Mantiene abiertas las novedades, sus IDs y la evidencia histórica.
-- No altera lotes cerrados ni movimientos monetarios existentes.
update public.liquidation_incidents i
set bloquea_aprobacion=false,
 descripcion=case when i.tipo='imei_sin_venta_vinculada'
 then 'Pendiente de conciliación Retail por IMEI, tienda y operación. La venta puede registrarse después; conservar ambas fechas. No bloquea liquidación ni aplicación del abono y no debe duplicarlo.'
 else 'Pendiente de carga o conciliación en Retail. No se encontró inventario/venta vinculada; no bloquea liquidación ni aplicación del abono. Conservar fechas y conciliar sin duplicar movimientos.' end
from public.liquidation_operations o, public.liquidations l
where i.operation_id=o.id and i.liquidation_id=l.id and o.liquidation_id=l.id
 and o.tipo_establecimiento='propia'
 and i.tipo in ('imei_sin_venta_vinculada','imei_no_existe')
 and i.estado='abierta' and l.approved_at is null and l.frozen_at is null;

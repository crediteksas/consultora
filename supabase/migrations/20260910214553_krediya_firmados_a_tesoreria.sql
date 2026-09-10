-- Regla aclarada por Gerencia: FIRMADO + solicitud Aprobado puede liquidarse
-- aunque el pago de la fuente esté PENDIENTE. No autoriza ni registra pagos.
-- No cambia filas existentes, tarifas, importes ni liquidaciones congeladas.
do $migration$
declare d text; old_condition text; new_condition text;
begin
 d:=pg_get_functiondef('kora_private.krediya_control_elegibilidad()'::regprocedure);
 old_condition:=$old$elsif pago='pendiente' then motivo:='krediya_pago_pendiente';
 elsif contrato<>'firmado' or pago<>'pagado' or nullif(btrim(new.external_id),'') is null then$old$;
 new_condition:=$new$elsif pago='pendiente' and not (contrato='firmado' and kora_private.krediya_estado_fuente(new.normalized_data,'Estado de la solicitud')='aprobado') then motivo:='krediya_pago_pendiente';
 elsif contrato<>'firmado' or pago not in ('pagado','pendiente') or nullif(btrim(new.external_id),'') is null then$new$;
 if strpos(d,old_condition)=0 then raise exception 'Definición de elegibilidad inesperada'; end if;
 execute replace(d,old_condition,new_condition);

 -- Comprobar DESPUÉS de preparar catálogo: sus controles pueden excluir filas.
 -- Nunca guardar sum(NULL), ni inventar un total cero para habilitar un lote vacío.
 d:=pg_get_functiondef('krediya_private.calcular_y_enviar_aprobacion(uuid)'::regprocedure);
 old_condition:='perform kora_private.preparar_catalogo_liquidacion(p_id);';
 new_condition:=$new$perform kora_private.preparar_catalogo_liquidacion(p_id);
 if not exists(select 1 from public.liquidation_operations where liquidation_id=p_id and reconocida) then
  raise exception 'No hay créditos finalizados elegibles en este lote. Los no firmados o no aprobados permanecen en seguimiento; no generan pagos.';
 end if;$new$;
 if strpos(d,old_condition)=0 then raise exception 'Motor Krediya inesperado'; end if;
 execute replace(d,old_condition,new_condition);

 d:=pg_get_functiondef('kora_private.krediya_descripcion_seguimiento(text,text,text)'::regprocedure);
 d:=replace(d,'Krediya lo reporta PENDIENTE.','Contrato no finalizado; pago reportado PENDIENTE.');
 d:=replace(d,'No consta FIRMADO y PAGADO en el archivo.','No consta un contrato finalizado elegible en el archivo.');
 execute d;
 d:=pg_get_functiondef('kora_private.krediya_registrar_seguimiento()'::regprocedure);
 execute replace(d,'El crédito reapareció FIRMADO y PAGADO en el lote ','El crédito reapareció finalizado y elegible para liquidación en el lote ');
end $migration$;

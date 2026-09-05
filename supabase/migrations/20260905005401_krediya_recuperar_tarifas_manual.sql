-- Fuente contrastada: SEMANA K DEL 24 AL AGOSTO 2026.xlsx, Hoja1 J=PVP / K=PAGAMOS.
-- SHA256 48263902ee56de66ecdd007bdd1826dad090962e4a81408cd6cedc5b9dcc55f2
-- Recupera solo valores documentados. No confirma diferencias, calcula ni autoriza pagos.
do $repair$
declare x record; v_id uuid; o record; v_fuente jsonb;
begin
 for x in select * from (values
 ('REDMI A7 PRO 64GB 4RAM',492800::numeric,369600::numeric,54,'REDMI A7 PRO 64GB 4RAM'),
 ('TECNO SPARK GO 3 4GB RAM 64GB REGULAR',591500::numeric,443625::numeric,49,'TECNO SPARK GO 3 4GB RAM 64GB')
 ) as source(referencia,pvp,pagamos,fila,referencia_fuente) loop
  if not exists(select 1 from public.krediya_price_rules where referencia_clave='ref:'||regexp_replace(lower(x.referencia),'[^a-z0-9]','','g') and activo) then
   insert into public.krediya_price_rules(referencia_clave,referencia,precio_venta,pagamos,vigente_desde)
   values('ref:'||regexp_replace(lower(x.referencia),'[^a-z0-9]','','g'),x.referencia,x.pvp,x.pagamos,date '2026-08-12')
   returning id into v_id;
   insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
   values(null,'krediya_tarifa_recuperada_manual','krediya_price_rules',v_id::text,jsonb_build_object(
    'archivo','SEMANA K DEL 24 AL AGOSTO 2026.xlsx','sha256','48263902ee56de66ecdd007bdd1826dad090962e4a81408cd6cedc5b9dcc55f2',
    'hoja','Hoja1','referencia_fuente',x.referencia_fuente,'pvp_celda','J'||x.fila,'pagamos_celda','K'||x.fila,'pvp',x.pvp,'pagamos',x.pagamos,
    'motivo',case when x.fila=49 then 'Alias explícito: mismo modelo TECNO KN3, 64GB y 4GB RAM; no confundir con 128GB' else 'Fila adicional omitida en carga de 52 referencias' end));
  end if;
 end loop;
 -- El manual de Infinix respalda Pagamos, pero J55=0 por costo vacío.
 -- Se conserva como evidencia parcial por operación, NO como tarifa válida ni decisión.
 for o in select op.id,op.policy_snapshot from public.liquidation_operations op join public.liquidations l on l.id=op.liquidation_id
 where op.plataforma='krediya' and op.external_id='cob6uk5' and op.referencia='INFINIX HOT 60 PRO+ 256GB 8+8RAM'
 and op.reconocida and l.frozen_at is null and l.estado in ('importada','con_novedades','validada','calculada')
 and not coalesce(op.policy_snapshot,'{}'::jsonb) ? 'pagamos_fuente_manual'
 for update of l,op loop
  v_fuente:=jsonb_build_object('pagamos',890000,'pvp',null,'archivo','SEMANA K DEL 24 AL AGOSTO 2026.xlsx',
    'sha256','48263902ee56de66ecdd007bdd1826dad090962e4a81408cd6cedc5b9dcc55f2','hoja','Hoja1','celda','K55',
    'observacion','J55=0 porque I55 está vacío. Pagamos validado también en LIQUIDACION!AJ2; falta PVP válido.');
  update public.liquidation_operations set policy_snapshot=coalesce(policy_snapshot,'{}'::jsonb)||jsonb_build_object('pagamos_fuente_manual',v_fuente) where id=o.id;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(null,'krediya_pagamos_recuperado_manual','liquidation_operations',o.id::text,jsonb_build_object('anterior',o.policy_snapshot,'fuente',v_fuente));
 end loop;
end $repair$;

create or replace function public.aliados_contexto_precio_krediya(p_operation_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare o public.liquidation_operations%rowtype; r public.krediya_price_rules%rowtype; b numeric; recibido numeric; pago_recibido numeric;
begin
 if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado'; end if;
 select * into o from public.liquidation_operations where id=p_operation_id and plataforma='krediya';
 if not found then raise exception 'Operación no encontrada'; end if;
 select * into r from public.krediya_price_rules where referencia_clave in (
 'ref:'||regexp_replace(lower(coalesce(o.referencia,'')),'[^a-z0-9]','','g'),
 lower(btrim(coalesce(o.modelo,o.referencia,''))))
 and activo and vigente_desde<=(o.operation_at at time zone 'America/Bogota')::date
 and (vigente_hasta is null or vigente_hasta>=(o.operation_at at time zone 'America/Bogota')::date)
 order by (referencia_clave like 'ref:%') desc,vigente_desde desc,created_at desc limit 1;
 recibido:=coalesce(nullif(o.policy_snapshot->'krediya_fuente'->>'valorComercial','')::numeric,nullif(o.normalized_data->>'valorComercial','')::numeric,coalesce(o.monto_credito,o.monto_base)+o.inicial);
 pago_recibido:=case when o.policy_snapshot ? 'krediya_fuente' then nullif(o.policy_snapshot->'krediya_fuente'->>'pagamosArchivo','')::numeric when o.normalized_data->>'origenValoresLiquidacion'='tarifario_kora' then null else nullif(o.normalized_data->>'pagamosArchivo','')::numeric end;
 select sum(valor) into b from public.krediya_bonus_rules where tipo_establecimiento=o.tipo_establecimiento and activo
 and vigente_desde<=(o.operation_at at time zone 'America/Bogota')::date and (vigente_hasta is null or vigente_hasta>=(o.operation_at at time zone 'America/Bogota')::date);
 return jsonb_build_object('operation_id',o.id,'referencia',coalesce(o.referencia,o.modelo),'modelo',o.modelo,'tienda',o.establishment_name,
 'imei',o.imei,'fecha',(o.operation_at at time zone 'America/Bogota')::date,'pvp_guardado',r.precio_venta,'pagamos_guardado',coalesce(r.pagamos,nullif(o.policy_snapshot->'pagamos_fuente_manual'->>'pagamos','')::numeric),
 'fuente_pagamos',case when r.id is null then o.policy_snapshot->'pagamos_fuente_manual' else null end,
 'pvp_recibido',recibido,'pagamos_recibido',pago_recibido,'diferencia_pvp',recibido-r.precio_venta,
 'bonos',b,'inicial',o.inicial,'decision',o.policy_snapshot->'decision_precio','regla_id',r.id);
end$$;

revoke all on function public.aliados_contexto_precio_krediya(uuid) from public,anon;
grant execute on function public.aliados_contexto_precio_krediya(uuid) to authenticated;

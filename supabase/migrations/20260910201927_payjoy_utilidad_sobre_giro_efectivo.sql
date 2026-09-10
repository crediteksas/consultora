-- Autorización Gerencia 2026-09-10: corregir utilidad, jamás los pagos.
-- Alcance de datos: único lote PayJoy cargado hoy, ventas del 9, no aprobado.
do $migration$
declare
 fn text; old_formula text := 'v_util:=round(case when o.plataforma=''alo'' then coalesce(o.monto_credito,o.monto_base)-v_pago-v_bonus else v_base-v_pagamos-v_bonus end,2);';
 ids uuid[]; before_payments text; after_payments text; previous_rows jsonb; n integer;
begin
 select pg_get_functiondef('kora_private.calcular_liquidacion_sin_datos_pago(uuid)'::regprocedure) into fn;
 if strpos(fn,old_formula)=0 then raise exception 'Fórmula inesperada: revisar antes de aplicar'; end if;
 -- El histórico conserva su regla anterior si alguien recalcula un borrador antiguo.
 fn:=replace(fn,old_formula,
 'v_util:=round(case when o.plataforma=''alo'' or (o.plataforma=''payjoy'' and v.created_at >= timestamptz ''2026-09-10 00:00:00-05'') then coalesce(o.monto_credito,o.monto_base)-v_pago-v_bonus else v_base-v_pagamos-v_bonus end,2);');

 perform 1 from public.liquidations where plataforma='payjoy'
 and created_at >= timestamptz '2026-09-10 00:00:00-05' and created_at < timestamptz '2026-09-11 00:00:00-05' for update;
 select array_agg(id) into ids from public.liquidations where plataforma='payjoy'
 and created_at >= timestamptz '2026-09-10 00:00:00-05' and created_at < timestamptz '2026-09-11 00:00:00-05';
 if coalesce(cardinality(ids),0)<>1 then raise exception 'Cambió el alcance: se esperaba un lote'; end if;
 if exists(select 1 from public.liquidations where id=any(ids) and (frozen_at is not null or estado<>'revisada')) then raise exception 'Lote ya aprobado o cambió su revisión'; end if;
 perform 1 from public.liquidation_operations where liquidation_id=any(ids) for update;
 perform 1 from public.liquidation_calculations where liquidation_id=any(ids) for update;
 select count(*) into n from public.liquidation_calculations where liquidation_id=any(ids);
 if n<>5 or (select count(*) from public.liquidation_operations where liquidation_id=any(ids))<>5 then raise exception 'Cambió el alcance de cinco operaciones'; end if;
 if exists(select 1 from public.liquidation_operations o join public.liquidation_calculations c on c.operation_id=o.id
 where o.liquidation_id=any(ids) and ((o.operation_at at time zone 'America/Bogota')::date <> date '2026-09-09'
 or c.utilidad_creditek is distinct from round(coalesce(o.monto_credito,o.monto_base)-c.pagamos-c.total_bonos,2)
 or c.pago_aliado is distinct from c.pagamos-o.inicial)) then raise exception 'Valores diferentes del diagnóstico'; end if;
 -- Huella de los registros que nunca deben cambiar, incluyendo soportes y autorizaciones.
 select md5(jsonb_build_array(
 (select jsonb_agg(to_jsonb(p) order by id) from public.payment_orders p),
 (select jsonb_agg(to_jsonb(p) order by id) from public.payment_items p),
 (select jsonb_agg(to_jsonb(b) order by id) from public.liquidation_bonuses b))::text) into before_payments;
 select jsonb_agg(jsonb_build_object('operation',to_jsonb(o),'calculation',to_jsonb(c))) into previous_rows
 from public.liquidation_operations o join public.liquidation_calculations c on c.operation_id=o.id where o.liquidation_id=any(ids);

 execute fn;
 update public.liquidation_calculations c set utilidad_creditek=round(coalesce(o.monto_credito,o.monto_base)-c.pago_aliado-c.total_bonos,2),
 explanation=c.explanation||jsonb_build_object('formula_utilidad','RECIBIMOS_MENOS_GIRO_MENOS_BONOS','correccion_utilidad_fecha','2026-09-10')
 from public.liquidation_operations o where c.operation_id=o.id and o.liquidation_id=any(ids);
 update public.liquidation_operations o set utilidad_creditek=c.utilidad_creditek,
 utilidad_creditek_tienda=case when o.tipo_establecimiento='propia' then c.utilidad_creditek else o.utilidad_creditek_tienda end
 from public.liquidation_calculations c where c.operation_id=o.id and o.liquidation_id=any(ids);
 update public.liquidations l set total_utilidad_creditek=s.total,total_utilidad_tiendas=s.tiendas from
 (select o.liquidation_id,sum(c.utilidad_creditek) total,coalesce(sum(c.utilidad_creditek) filter(where o.tipo_establecimiento='propia'),0) tiendas
 from public.liquidation_operations o join public.liquidation_calculations c on c.operation_id=o.id where o.liquidation_id=any(ids) group by o.liquidation_id) s
 where l.id=s.liquidation_id;
 select md5(jsonb_build_array(
 (select jsonb_agg(to_jsonb(p) order by id) from public.payment_orders p),
 (select jsonb_agg(to_jsonb(p) order by id) from public.payment_items p),
 (select jsonb_agg(to_jsonb(b) order by id) from public.liquidation_bonuses b))::text) into after_payments;
 if before_payments is distinct from after_payments then raise exception 'Se modificaron pagos o bonos: abortar'; end if;
 insert into public.audit_log(accion,tabla,registro_id,detalle) values('payjoy_correccion_solo_utilidad','liquidations',ids[1],
 jsonb_build_object('autorizacion','Gerencia: corregir utilidad de lote cargado hoy, sin modificar pagos','antes',previous_rows,'huella_pagos_bonos',before_payments,'formula','recibimos - giro efectivo - bonos'));
end
$migration$;

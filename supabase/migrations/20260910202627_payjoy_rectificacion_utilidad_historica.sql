-- Gerencia autoriza solo rectificar utilidades; pagos y cierres se conservan.
create table kora_private.rectificacion_payjoy_utilidad_20260910(
 operation_id uuid primary key references public.liquidation_operations(id),before_data jsonb not null,
 after_data jsonb,diferencia numeric not null,closed_delta numeric not null,treasury_delta numeric not null default 0,
 created_at timestamptz not null default now());
alter table kora_private.rectificacion_payjoy_utilidad_20260910 enable row level security;
revoke all on kora_private.rectificacion_payjoy_utilidad_20260910 from public,anon,authenticated,service_role;
do $fix$
declare fn text;patched text;guard_op text;guard_lot text;adjustment record;balance_data jsonb;
 protected_before jsonb;protected_after jsonb;n int;delta numeric;
begin
 lock table public.liquidations,public.liquidation_operations,public.liquidation_calculations,public.payment_orders,
 public.payment_items,public.liquidation_bonuses,public.treasury_movements,public.liquidation_treasury_destinations,
 public.retail_b2b_compensations in share row exclusive mode;
 insert into kora_private.rectificacion_payjoy_utilidad_20260910(operation_id,before_data,diferencia,closed_delta)
 select o.id,jsonb_build_object('operacion',to_jsonb(o),'calculo',to_jsonb(c),'lote',to_jsonb(l)),
 round(coalesce(o.monto_credito,o.monto_base)-c.pago_aliado-c.total_bonos-c.utilidad_creditek,2),
 case when o.cierre_utilidad_at is not null then round(coalesce(o.monto_credito,o.monto_base)-c.pago_aliado-c.total_bonos-c.utilidad_creditek,2) else 0 end
 from public.liquidation_operations o join public.liquidation_calculations c on c.operation_id=o.id join public.liquidations l on l.id=o.liquidation_id
 where o.plataforma='payjoy' and o.operation_at>=timestamptz '2026-08-24 00:00-05' and o.operation_at<timestamptz '2026-09-09 00:00-05'
 and c.utilidad_creditek<>round(coalesce(o.monto_credito,o.monto_base)-c.pago_aliado-c.total_bonos,2);
 select count(*),sum(diferencia) into n,delta from kora_private.rectificacion_payjoy_utilidad_20260910;
 if n<>57 or delta<>8269440 then raise exception 'Alcance cambió: % filas, % diferencia',n,delta;end if;
 if exists(select 1 from kora_private.rectificacion_payjoy_utilidad_20260910 r join public.liquidation_operations o on o.id=r.operation_id join public.liquidation_calculations c on c.operation_id=o.id
 where r.diferencia<>o.inicial or c.pagamos-o.inicial<>c.pago_aliado or c.utilidad_creditek is distinct from o.utilidad_creditek
 or (o.cierre_utilidad_at is not null and o.resultado_cerrado<>o.utilidad_creditek) or(o.cierre_utilidad_at is null and o.resultado_cerrado<>0)) then raise exception 'Snapshot o cierre cambió';end if;
 if exists(select 1 from public.aliados_reversiones where original_operation_id in(select operation_id from kora_private.rectificacion_payjoy_utilidad_20260910)) then raise exception 'Reversión requiere conciliación';end if;
 select jsonb_build_object(
 'pagos',(select jsonb_agg(to_jsonb(x) order by id) from public.payment_orders x),
 'items',(select jsonb_agg(to_jsonb(x) order by id) from public.payment_items x),
 'bonos',(select jsonb_agg(to_jsonb(x) order by id) from public.liquidation_bonuses x),
 'movimientos',(select jsonb_agg(to_jsonb(x) order by id) from public.treasury_movements x),
 'cuentas',(select jsonb_agg(to_jsonb(x) order by id) from public.cuenta_corriente x),
 'historico',(select jsonb_agg(to_jsonb(x) order by id) from public.creditos_historicos_plataforma x)) into protected_before;
 -- Excepción solo en esta transacción y solo columnas derivadas. Restaurar antes de commit.
 select pg_get_functiondef('public.aliados_impedir_cambio_operacion_aprobada()'::regprocedure) into guard_op;
 select pg_get_functiondef('public.aliados_impedir_cambio_aprobado()'::regprocedure) into guard_lot;
 patched:=regexp_replace(guard_op,'\mbegin\M','begin '||format($g$
 if TG_OP='UPDATE' and txid_current()=%s and exists(select 1 from kora_private.rectificacion_payjoy_utilidad_20260910 where operation_id=old.id)
 and(to_jsonb(old)-array['utilidad_creditek','utilidad_creditek_tienda','resultado_cerrado'])=(to_jsonb(new)-array['utilidad_creditek','utilidad_creditek_tienda','resultado_cerrado']) then return new;end if;
 $g$,txid_current()),'i');
 if patched=guard_op then raise exception 'Guarda inesperada';end if;execute patched;
 patched:=regexp_replace(guard_lot,'\mbegin\M','begin '||format($g$
 if TG_OP='UPDATE' and txid_current()=%s and exists(select 1 from kora_private.rectificacion_payjoy_utilidad_20260910 r join public.liquidation_operations o on o.id=r.operation_id where o.liquidation_id=old.id)
 and(to_jsonb(old)-array['total_utilidad_creditek','total_utilidad_tiendas'])=(to_jsonb(new)-array['total_utilidad_creditek','total_utilidad_tiendas']) then return new;end if;
 $g$,txid_current()),'i');
 if patched=guard_lot then raise exception 'Guarda inesperada';end if;execute patched;
 update public.liquidation_calculations c set utilidad_creditek=c.utilidad_creditek+r.diferencia,
 explanation=explanation||jsonb_build_object('formula_utilidad','RECIBIMOS_MENOS_GIRO_MENOS_BONOS','rectificacion_fecha','2026-09-10')
 from kora_private.rectificacion_payjoy_utilidad_20260910 r where c.operation_id=r.operation_id;
 update public.liquidation_operations o set utilidad_creditek=o.utilidad_creditek+r.diferencia,
 utilidad_creditek_tienda=case when o.tipo_establecimiento='propia' then o.utilidad_creditek+r.diferencia else o.utilidad_creditek_tienda end,
 resultado_cerrado=o.resultado_cerrado+r.closed_delta from kora_private.rectificacion_payjoy_utilidad_20260910 r where o.id=r.operation_id;
 update public.liquidations l set total_utilidad_creditek=s.total,total_utilidad_tiendas=s.tiendas from
 (select o.liquidation_id,sum(c.utilidad_creditek) total,coalesce(sum(c.utilidad_creditek) filter(where o.tipo_establecimiento='propia'),0) tiendas
 from public.liquidation_operations o join public.liquidation_calculations c on c.operation_id=o.id
 where o.liquidation_id in(select o2.liquidation_id from public.liquidation_operations o2 join kora_private.rectificacion_payjoy_utilidad_20260910 r on r.operation_id=o2.id)
 group by o.liquidation_id)s where l.id=s.liquidation_id;
 execute guard_op;execute guard_lot;
 -- Asiento adicional de saldo INTERNO, no nuevo pago ni ingreso bancario.
 for adjustment in select r.*,o.liquidation_id,m.type,m.amount original_amount,(r.before_data->'calculo'->>'utilidad_creditek')::numeric original_utility
 from kora_private.rectificacion_payjoy_utilidad_20260910 r join public.liquidation_operations o on o.id=r.operation_id
 join public.treasury_movements m on m.idempotency_key='commission-operation:'||o.id
 where r.closed_delta=0 and m.unit='tercerizacion' and m.direction='credit' and m.status in('pagado','conciliado') order by o.id loop
 if adjustment.original_amount<>adjustment.original_utility then raise exception 'Comisión original no coincide %',adjustment.operation_id;end if;
 balance_data:=public.tesoreria_aplicar_saldo('tercerizacion','credit',adjustment.diferencia,'payjoy-utility-correction:'||adjustment.operation_id);
 insert into public.treasury_movements(unit,direction,type,concept,amount,movement_date,liquidation_id,balance_before,balance_after,status,idempotency_key)
 values('tercerizacion','credit',adjustment.type,'Rectificación utilidad PayJoy — ajuste interno, no ingreso bancario ni pago',adjustment.diferencia,date '2026-09-10',adjustment.liquidation_id,
 (balance_data->>'before')::numeric,(balance_data->>'after')::numeric,'pagado','payjoy-utility-correction:'||adjustment.operation_id);
 update kora_private.rectificacion_payjoy_utilidad_20260910 set treasury_delta=adjustment.diferencia where operation_id=adjustment.operation_id;
 end loop;
 update public.liquidation_treasury_destinations d set total_outsourcing_commission=d.total_outsourcing_commission+s.delta
 from(select o.liquidation_id,sum(r.treasury_delta) delta from kora_private.rectificacion_payjoy_utilidad_20260910 r join public.liquidation_operations o on o.id=r.operation_id group by o.liquidation_id)s where d.liquidation_id=s.liquidation_id;
 update public.retail_b2b_compensations b set outsourcing_commission=b.outsourcing_commission+r.treasury_delta
 from kora_private.rectificacion_payjoy_utilidad_20260910 r where b.operation_id=r.operation_id and r.treasury_delta<>0;
 select pg_get_functiondef('kora_private.calcular_liquidacion_sin_datos_pago(uuid)'::regprocedure) into fn;
 patched:=replace(fn,$old$(o.plataforma='payjoy' and v.created_at >= timestamptz '2026-09-10 00:00:00-05')$old$,$new$o.plataforma='payjoy'$new$);
 if patched=fn then raise exception 'Motor PayJoy inesperado';end if;execute patched;
 select pg_get_functiondef('public.tesoreria_generar_destinos_liquidacion(uuid)'::regprocedure) into fn;
 patched:=replace(fn,$old$elsif l.plataforma='alo' then commission_value:=o.utilidad_creditek; else$old$,$new$elsif l.plataforma in('alo','payjoy') then commission_value:=o.utilidad_creditek; else$new$);
 if patched=fn then raise exception 'Motor destinos inesperado';end if;execute patched;
 select pg_get_functiondef('kora_private.reversion_guardar(uuid)'::regprocedure) into fn;
 patched:=replace(fn,$old$idempotency_key='commission-operation:'||o.id$old$,$new$idempotency_key in('commission-operation:'||o.id,'payjoy-utility-correction:'||o.id)$new$);
 if patched=fn then raise exception 'Motor reversión inesperado';end if;execute patched;
 select jsonb_build_object(
 'pagos',(select jsonb_agg(to_jsonb(x) order by id) from public.payment_orders x),
 'items',(select jsonb_agg(to_jsonb(x) order by id) from public.payment_items x),
 'bonos',(select jsonb_agg(to_jsonb(x) order by id) from public.liquidation_bonuses x),
 'movimientos',(select jsonb_agg(to_jsonb(x) order by id) from public.treasury_movements x where idempotency_key is null or idempotency_key not like 'payjoy-utility-correction:%'),
 'cuentas',(select jsonb_agg(to_jsonb(x) order by id) from public.cuenta_corriente x),
 'historico',(select jsonb_agg(to_jsonb(x) order by id) from public.creditos_historicos_plataforma x)) into protected_after;
 if protected_before is distinct from protected_after then raise exception 'Cambió información protegida';end if;
 if exists(select 1 from public.liquidation_operations o join kora_private.rectificacion_payjoy_utilidad_20260910 r on r.operation_id=o.id where r.closed_delta<>0 and o.utilidad_creditek<>o.resultado_cerrado) then raise exception 'Cierre reabierto';end if;
 update kora_private.rectificacion_payjoy_utilidad_20260910 r set after_data=jsonb_build_object('operacion',to_jsonb(o),'calculo',to_jsonb(c),'lote',to_jsonb(l))
 from public.liquidation_operations o join public.liquidation_calculations c on c.operation_id=o.id join public.liquidations l on l.id=o.liquidation_id where o.id=r.operation_id;
 insert into public.audit_log(accion,tabla,detalle) values('payjoy_rectificacion_utilidades_historicas','liquidation_operations',
 jsonb_build_object('autorizacion','Gerencia: cuadrar utilidades sin tocar pagos ni reabrir cierres','operaciones',n,'diferencia',delta,'huella_protegida',md5(protected_before::text)));
end $fix$;

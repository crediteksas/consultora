begin;
do $guard$ begin
 if to_regclass('public.treasury_movements') is not null and exists(select 1 from public.treasury_movements where status in('pagado','conciliado')) then raise exception 'Rollback bloqueado: existen movimientos conciliados o aplicados';end if;
 if to_regclass('public.retail_b2b_compensations') is not null and exists(select 1 from public.retail_b2b_compensations) then raise exception 'Rollback bloqueado: existen compensaciones Retail aplicadas a Cuenta Corriente';end if;
end;$guard$;
drop trigger if exists liquidation_generate_treasury_destinations on public.liquidations;
drop trigger if exists liquidation_remove_future_retail_payments on public.liquidations;
drop function if exists public.tesoreria_after_liquidation_approval();
drop function if exists public.tesoreria_eliminar_pagos_retail_nuevos();
drop function if exists public.tesoreria_generar_destinos_liquidacion(uuid);
drop function if exists public.tesoreria_registrar_movimiento(text,text,text,text,numeric,text,date,text,uuid,uuid,uuid,text);
drop function if exists public.tesoreria_autorizar_movimiento(uuid);
drop function if exists public.tesoreria_cambiar_estado_movimiento(uuid,text,text);
drop function if exists public.tesoreria_aplicar_saldo(text,text,numeric,text);
drop table if exists public.treasury_movements;
drop table if exists public.retail_b2b_compensations;
drop table if exists public.liquidation_treasury_destinations;
drop table if exists public.treasury_unit_balances;

create or replace function public.aliados_cambiar_estado_pago(p_id uuid,p_estado text,p_soporte_path text default null)
returns public.payment_orders language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.payment_orders%rowtype;v_anterior text;v_event text;
begin
 if not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para gestionar pagos';end if;
 select * into v from public.payment_orders where id=p_id for update;if not found then raise exception 'Pago no encontrado';end if;
 v_anterior:=v.estado;
 if (v.estado,p_estado) not in (('pendiente','programado'),('programado','pagado'),('pagado','conciliado')) then raise exception 'Transición de pago inválida';end if;
 if p_estado in('pagado','conciliado') and not public.tiene_capacidad_aliados('aprobador') then raise exception 'Solo Óscar/aprobador puede confirmar el pago';end if;
 update public.payment_orders set estado=p_estado,fecha_programada=case when p_estado='programado' then current_date else fecha_programada end,
  fecha_pagada=case when p_estado='pagado' then now() else fecha_pagada end,soporte_path=coalesce(nullif(btrim(p_soporte_path),''),soporte_path),updated_at=now()
 where id=p_id returning * into v;
 v_event:=case p_estado when 'programado' then 'payment.scheduled' when 'pagado' then 'payment.completed' else null end;
 if v_event is not null then insert into public.liquidation_domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values(v_event,'payment',p_id,jsonb_build_object('payment_id',p_id,'liquidation_id',v.liquidation_id),p_id||':'||p_estado) on conflict(idempotency_key) do nothing;end if;
 if not exists(select 1 from public.payment_orders where liquidation_id=v.liquidation_id and estado<>p_estado) then
  update public.liquidations set estado=case p_estado when 'programado' then 'programada' when 'pagado' then 'pagada' when 'conciliado' then 'conciliada' end,updated_at=now() where id=v.liquidation_id;
 end if;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'aliados_pago_'||p_estado,'payment_orders',p_id,jsonb_build_object('anterior',v_anterior,'nuevo',p_estado,'soporte_path',v.soporte_path));
 return v;
end;$$;

do $event_constraint$ declare name text;begin
 for name in select conname from pg_constraint where conrelid='public.liquidation_domain_events'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%event_type%' loop execute format('alter table public.liquidation_domain_events drop constraint %I',name);end loop;
 alter table public.liquidation_domain_events add constraint liquidation_domain_events_event_type_check check(event_type in('liquidation.imported','liquidation.validated','liquidation.has_incidents','liquidation.calculated','liquidation.reviewed','liquidation.approved','payment.scheduled','payment.completed','payment.rejected','liquidation.closed'));
end;$event_constraint$;
drop policy if exists soportes_aliados_insert on storage.objects;
create policy soportes_aliados_insert on storage.objects for insert to authenticated with check(bucket_id='soportes' and public.tiene_capacidad_aliados('revisor') and name ~ '^aliados/(originales|pagos)/[0-9a-f-]{36}\.(xlsx|xls|pdf|jpg|jpeg|png)$');
drop policy if exists soportes_aliados_select on storage.objects;
create policy soportes_aliados_select on storage.objects for select to authenticated using(bucket_id='soportes' and public.tiene_capacidad_aliados('revisor') and name ~ '^aliados/(originales|pagos)/');
commit;

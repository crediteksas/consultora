-- Tesorería de Tercerización y compensaciones B2B. Aditiva desde 2026-08-05.
begin;

do $preflight$
begin
 if to_regclass('public.liquidations') is null or to_regclass('public.liquidation_operations') is null
    or to_regclass('public.payment_orders') is null or to_regclass('public.payment_items') is null
    or to_regclass('public.liquidation_beneficiaries') is null or to_regclass('public.beneficiary_bank_accounts') is null
    or to_regclass('public.cuenta_corriente') is null or to_regclass('public.audit_log') is null
    or to_regprocedure('public.registrar_pago_proveedor(uuid,numeric,date,text,text,text,text,uuid)') is null then
  raise exception 'Faltan dependencias reutilizables de Liquidaciones o Cuenta Corriente B2B';
 end if;
end;$preflight$;

alter table public.payment_orders add column if not exists payment_kind text check(payment_kind in('aliado','ejecutivo'));
alter table public.payment_orders add column if not exists concept text;
alter table public.payment_orders add column if not exists cutoff_snapshot date;
alter table public.payment_orders add column if not exists platform_snapshot text;
alter table public.payment_orders add column if not exists operations_count integer not null default 0;
alter table public.payment_orders add column if not exists commercial_value numeric(16,2) not null default 0;
alter table public.payment_orders add column if not exists own_bonuses numeric(16,2) not null default 0;
alter table public.payment_orders add column if not exists bank_snapshot jsonb;
alter table public.payment_orders add column if not exists paid_by uuid references public.perfiles(id);

create table if not exists public.treasury_unit_balances(
 unit text primary key check(unit in('b2b','tercerizacion')),
 balance numeric(16,2) not null default 0,
 updated_at timestamptz not null default now(),
 check(balance>=0)
);
insert into public.treasury_unit_balances(unit) values('b2b'),('tercerizacion') on conflict(unit) do nothing;

create table if not exists public.liquidation_treasury_destinations(
 id uuid primary key default gen_random_uuid(),liquidation_id uuid not null references public.liquidations(id),
 received_from_platform numeric(16,2) not null,total_allies numeric(16,2) not null,total_executives numeric(16,2) not null,
 total_b2b_compensations numeric(16,2) not null,total_outsourcing_commission numeric(16,2) not null,
 generated_by uuid not null references public.perfiles(id),generated_at timestamptz not null default now(),
 constraint liquidation_treasury_destinations_unique unique(liquidation_id)
);

create table if not exists public.retail_b2b_compensations(
 id uuid primary key default gen_random_uuid(),liquidation_id uuid not null references public.liquidations(id),
 operation_id uuid not null references public.liquidation_operations(id),store_code text not null references public.origenes(codigo),
 platform text not null,cutoff_date date,imei text,commercial_value numeric(16,2) not null,initial_value numeric(16,2) not null,
 policy_percentage numeric(8,6) not null,compensation_value numeric(16,2) not null,outsourcing_commission numeric(16,2) not null,
 account_balance_before numeric(16,2) not null,account_balance_after numeric(16,2) not null,
 created_by uuid not null references public.perfiles(id),created_at timestamptz not null default now(),reversed_at timestamptz,
 constraint retail_b2b_compensations_operation_unique unique(operation_id),check(compensation_value>=0)
);

create table if not exists public.treasury_movements(
 id uuid primary key default gen_random_uuid(),unit text not null references public.treasury_unit_balances(unit),
 direction text not null check(direction in('credit','debit')),
 type text not null check(type in('compensacion_retail','comision_retail','comision_aliado','pago_ejecutivo','pago_proveedor','otra_obligacion_b2b','gasto_administrativo','gasto_financiero','impuesto','retiro_socios','otro_movimiento_autorizado','ajuste','reverso')),
 beneficiary text,concept text not null,amount numeric(16,2) not null check(amount>0),destination_account text,movement_date date not null,
 support_path text,liquidation_id uuid references public.liquidations(id),payment_order_id uuid references public.payment_orders(id),
 compensation_id uuid references public.retail_b2b_compensations(id),supplier_id uuid references public.proveedores(id),
 supplier_invoice_id uuid references public.facturas_proveedor(id),balance_before numeric(16,2),balance_after numeric(16,2),
 status text not null default 'pendiente' check(status in('pendiente','programado','pagado','conciliado','rechazado','anulado','devuelto')),
 requested_by uuid not null references public.perfiles(id),authorized_by uuid references public.perfiles(id),paid_by uuid references public.perfiles(id),
 idempotency_key text not null unique,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((direction='credit' and status='pagado') or direction='debit')
);

create unique index if not exists treasury_payment_movement_unique on public.treasury_movements(payment_order_id) where payment_order_id is not null and type='pago_ejecutivo';
create index if not exists treasury_movements_filters_idx on public.treasury_movements(unit,type,status,movement_date desc);
create index if not exists retail_b2b_compensations_filters_idx on public.retail_b2b_compensations(platform,cutoff_date,store_code);

do $event_constraint$
declare name text;
begin
 for name in select conname from pg_constraint where conrelid='public.liquidation_domain_events'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%event_type%' loop
  execute format('alter table public.liquidation_domain_events drop constraint %I',name);
 end loop;
 alter table public.liquidation_domain_events add constraint liquidation_domain_events_event_type_check check(event_type in(
  'liquidation.imported','liquidation.validated','liquidation.has_incidents','liquidation.calculated','liquidation.reviewed','liquidation.approved','payment.scheduled','payment.completed','payment.rejected','liquidation.closed',
  'treasury.ally_payment_completed','treasury.executive_payment_completed','treasury.compensation_created','treasury.movement_completed'));
end;$event_constraint$;

create or replace function public.tesoreria_aplicar_saldo(p_unit text,p_direction text,p_amount numeric,p_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.treasury_unit_balances%rowtype;after_value numeric;
begin
 select * into b from public.treasury_unit_balances where unit=p_unit for update;
 if not found or p_amount<=0 then raise exception 'Movimiento de saldo inválido';end if;
 after_value:=case when p_direction='credit' then b.balance+p_amount else b.balance-p_amount end;
 if after_value<0 then raise exception 'Saldo insuficiente para la unidad económica';end if;
 update public.treasury_unit_balances set balance=after_value,updated_at=now() where unit=p_unit;
 return jsonb_build_object('before',b.balance,'after',after_value,'key',p_key);
end;$$;
revoke all on function public.tesoreria_aplicar_saldo(text,text,numeric,text) from public,anon,authenticated;

-- El motor vigente ya calcula el 76 %. Solo se retira la creación bancaria Retail futura.
do $retail_no_bank_payment$
declare definition text;old_block text;new_block text;
begin
 definition:=pg_get_functiondef('public.aliados_calcular_liquidacion(uuid)'::regprocedure);
 old_block:=$block$  select * into b from public.liquidation_beneficiaries where tipo=case when o.tipo_establecimiento='aliado' then 'aliado' else 'otro' end and origen_codigo=o.origen_codigo and activo limit 1;
  if not found then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'beneficiario_sin_identificacion','No existe beneficiario de pago') on conflict do nothing;continue;end if;
  select * into a from public.beneficiary_bank_accounts where beneficiary_id=b.id and activo and validada order by validada_at desc limit 1;
  if not found then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'cuenta_bancaria_no_validada','El beneficiario no tiene cuenta validada') on conflict do nothing;continue;end if;
  insert into public.payment_orders(liquidation_id,beneficiary_id,bank_account_id,valor,idempotency_key) values(p_id,b.id,a.id,v_pago,gen_random_uuid()) on conflict(liquidation_id,beneficiary_id) do update set valor=public.payment_orders.valor+excluded.valor returning id into v_order;
  insert into public.payment_items(payment_order_id,operation_id,concepto,valor) values(v_order,o.id,case when o.tipo_establecimiento='aliado' then 'pago_aliado' else 'pago_tienda' end,v_pago);$block$;
 new_block:=$block$  if not (v_future and o.tipo_establecimiento='propia') then
   select * into b from public.liquidation_beneficiaries where tipo=case when o.tipo_establecimiento='aliado' then 'aliado' else 'otro' end and origen_codigo=o.origen_codigo and activo limit 1;
   if not found then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'beneficiario_sin_identificacion','No existe beneficiario de pago') on conflict do nothing;continue;end if;
   select * into a from public.beneficiary_bank_accounts where beneficiary_id=b.id and activo and validada order by validada_at desc limit 1;
   if not found then insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion) values(p_id,o.id,'cuenta_bancaria_no_validada','El beneficiario no tiene cuenta validada') on conflict do nothing;continue;end if;
   insert into public.payment_orders(liquidation_id,beneficiary_id,bank_account_id,valor,idempotency_key) values(p_id,b.id,a.id,v_pago,gen_random_uuid()) on conflict(liquidation_id,beneficiary_id) do update set valor=public.payment_orders.valor+excluded.valor returning id into v_order;
   insert into public.payment_items(payment_order_id,operation_id,concepto,valor) values(v_order,o.id,case when o.tipo_establecimiento='aliado' then 'pago_aliado' else 'pago_tienda' end,v_pago);
  end if;$block$;
 if strpos(definition,old_block)>0 then execute replace(definition,old_block,new_block);
 elsif strpos(definition,'not (v_future and o.tipo_establecimiento=''propia'')')=0 then raise exception 'El motor unificado vigente no coincide con la integración de Tesorería';end if;
end;$retail_no_bank_payment$;

create or replace function public.tesoreria_eliminar_pagos_retail_nuevos()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.estado='calculada' and old.estado is distinct from new.estado then
  delete from public.payment_items pi using public.liquidation_operations o
   where pi.operation_id=o.id and o.liquidation_id=new.id and o.tipo_establecimiento='propia'
     and o.operation_at::date>=date '2026-08-05' and pi.concepto='pago_tienda';
  delete from public.payment_orders po where po.liquidation_id=new.id and not exists(select 1 from public.payment_items pi where pi.payment_order_id=po.id);
 end if;return new;
end;$$;
drop trigger if exists liquidation_remove_future_retail_payments on public.liquidations;
create trigger liquidation_remove_future_retail_payments after update of estado on public.liquidations for each row execute function public.tesoreria_eliminar_pagos_retail_nuevos();

create or replace function public.tesoreria_generar_destinos_liquidacion(p_liquidation_id uuid)
returns public.liquidation_treasury_destinations language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.liquidations%rowtype;o public.liquidation_operations%rowtype;destination public.liquidation_treasury_destinations%rowtype;
 comp public.retail_b2b_compensations%rowtype;bank public.beneficiary_bank_accounts%rowtype;beneficiary public.liquidation_beneficiaries%rowtype;
 received numeric:=0;allies numeric:=0;executives numeric:=0;b2b numeric:=0;commission numeric:=0;right_value numeric;comp_value numeric;commission_value numeric;
 account_before numeric;account_after numeric;balance_data jsonb;movement_id uuid;
begin
 if not public.tiene_capacidad_aliados('aprobador') then raise exception 'Solo Óscar/aprobador puede generar destinos';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_liquidation_id::text,0));
 select * into destination from public.liquidation_treasury_destinations where liquidation_id=p_liquidation_id;
 if found then return destination;end if;
 select * into l from public.liquidations where id=p_liquidation_id for update;
 if not found or l.estado<>'aprobada' or l.frozen_at is null then raise exception 'La liquidación debe estar aprobada e inmutable';end if;

 for o in select * from public.liquidation_operations where liquidation_id=l.id and operation_at::date>=date '2026-08-05' order by id loop
  if o.valor_comercial is null or o.porcentaje_politica is null or o.policy_snapshot is null then raise exception 'Operación sin cálculo o política congelada';end if;
  received:=received+coalesce(o.monto_credito,o.monto_base);
  right_value:=round(o.valor_comercial*o.porcentaje_politica,2);
  commission_value:=round(o.valor_comercial-right_value,2);
  commission:=commission+commission_value;
  if o.tipo_establecimiento='propia' then
   comp_value:=round(right_value-o.inicial,2);if comp_value<0 then raise exception 'Compensación Retail inválida';end if;
   select coalesce(sum(case when tipo='cargo' then monto else -monto end),0) into account_before from public.cuenta_corriente where tienda_codigo=o.origen_codigo;
   account_after:=account_before-comp_value;
   insert into public.retail_b2b_compensations(liquidation_id,operation_id,store_code,platform,cutoff_date,imei,commercial_value,initial_value,policy_percentage,compensation_value,outsourcing_commission,account_balance_before,account_balance_after,created_by)
   values(l.id,o.id,o.origen_codigo,l.plataforma,l.fecha_corte,o.imei,o.valor_comercial,o.inicial,o.porcentaje_politica,comp_value,commission_value,account_before,account_after,auth.uid())
   on conflict(operation_id) do nothing returning * into comp;
   if comp.id is not null then
    insert into public.cuenta_corriente(tienda_codigo,tipo,concepto,monto,referencia_tipo,referencia_id,usuario)
    values(o.origen_codigo,'abono','Compensación liquidación Retail — '||case when l.plataforma='alo' then 'ALO Credit' else 'PayJoy' end||' — corte '||coalesce(l.fecha_corte::text,'sin fecha'),comp_value,'compensacion_liquidacion_retail',comp.id,auth.uid());
    balance_data:=public.tesoreria_aplicar_saldo('b2b','credit',comp_value,'compensation:'||comp.id);
    insert into public.treasury_movements(unit,direction,type,beneficiary,concept,amount,movement_date,liquidation_id,compensation_id,balance_before,balance_after,status,requested_by,idempotency_key)
    values('b2b','credit','compensacion_retail',o.origen_codigo,'Compensación liquidación Retail — '||l.plataforma||' — corte '||coalesce(l.fecha_corte::text,'sin fecha'),comp_value,coalesce(l.fecha_corte,current_date),l.id,comp.id,(balance_data->>'before')::numeric,(balance_data->>'after')::numeric,'pagado',auth.uid(),'compensation:'||comp.id);
    insert into public.liquidation_domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key) values('treasury.compensation_created','liquidation',l.id,jsonb_build_object('liquidation_id',l.id,'store_code',o.origen_codigo,'amount',comp_value),o.id||':treasury_compensation') on conflict(idempotency_key) do nothing;
   end if;b2b:=b2b+comp_value;
  end if;
  if commission_value>0 then
   balance_data:=public.tesoreria_aplicar_saldo('tercerizacion','credit',commission_value,'commission-operation:'||o.id);
   insert into public.treasury_movements(unit,direction,type,concept,amount,movement_date,liquidation_id,balance_before,balance_after,status,requested_by,idempotency_key)
   values('tercerizacion','credit',case when o.tipo_establecimiento='propia' then 'comision_retail' else 'comision_aliado' end,
    'Comisión de Tercerización — '||case when o.tipo_establecimiento='propia' then 'Retail' else 'Aliados' end||' — '||l.plataforma||' — corte '||coalesce(l.fecha_corte::text,'sin fecha'),
    commission_value,coalesce(l.fecha_corte,current_date),l.id,(balance_data->>'before')::numeric,(balance_data->>'after')::numeric,'pagado',auth.uid(),'commission-operation:'||o.id);
  end if;
 end loop;

 for beneficiary in select distinct b.* from public.payment_orders po join public.liquidation_beneficiaries b on b.id=po.beneficiary_id where po.liquidation_id=l.id loop
  select * into bank from public.beneficiary_bank_accounts where beneficiary_id=beneficiary.id and activo and validada order by validada_at desc limit 1;
  if not found then raise exception 'Beneficiario sin cuenta bancaria validada';end if;
  update public.payment_orders po set payment_kind=case when beneficiary.tipo='ejecutivo' then 'ejecutivo' else 'aliado' end,
   concept=case when beneficiary.tipo='ejecutivo' then 'Bonos y comisiones — '||l.plataforma||' — corte '||coalesce(l.fecha_corte::text,'sin fecha') else 'Pago de '||(select count(distinct pi.operation_id) from public.payment_items pi where pi.payment_order_id=po.id)||' créditos '||case when l.plataforma='alo' then 'ALO Credit' else 'PayJoy' end||' — corte '||coalesce(l.fecha_corte::text,'sin fecha') end,
   cutoff_snapshot=l.fecha_corte,platform_snapshot=l.plataforma,operations_count=(select count(distinct pi.operation_id) from public.payment_items pi where pi.payment_order_id=po.id),
   commercial_value=coalesce((select sum(o.valor_comercial) from public.payment_items pi join public.liquidation_operations o on o.id=pi.operation_id where pi.payment_order_id=po.id),0),
   own_bonuses=coalesce((select sum(pi.valor) from public.payment_items pi where pi.payment_order_id=po.id and pi.bonus_id is not null),0),
   bank_snapshot=jsonb_build_object('bank',bank.banco,'account_type',bank.tipo_cuenta,'account_number',bank.numero_cuenta,'holder',beneficiary.nombre,'holder_identification',beneficiary.identificacion)
  where po.liquidation_id=l.id and po.beneficiary_id=beneficiary.id;
 end loop;
 select coalesce(sum(po.valor),0) into allies from public.payment_orders po join public.liquidation_beneficiaries b on b.id=po.beneficiary_id where po.liquidation_id=l.id and b.tipo='aliado';
 select coalesce(sum(po.valor),0) into executives from public.payment_orders po join public.liquidation_beneficiaries b on b.id=po.beneficiary_id where po.liquidation_id=l.id and b.tipo='ejecutivo';
 insert into public.liquidation_treasury_destinations(liquidation_id,received_from_platform,total_allies,total_executives,total_b2b_compensations,total_outsourcing_commission,generated_by)
 values(l.id,received,allies,executives,b2b,commission,auth.uid()) returning * into destination;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'tesoreria_destinos_generados','liquidations',l.id,jsonb_build_object('received',received,'allies',allies,'executives',executives,'b2b',b2b,'outsourcing_commission',commission));
 return destination;
end;$$;
revoke all on function public.tesoreria_generar_destinos_liquidacion(uuid) from public,anon;
grant execute on function public.tesoreria_generar_destinos_liquidacion(uuid) to authenticated;

create or replace function public.tesoreria_after_liquidation_approval()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin if new.estado='aprobada' and old.estado is distinct from new.estado then perform public.tesoreria_generar_destinos_liquidacion(new.id);end if;return new;end;$$;
drop trigger if exists liquidation_generate_treasury_destinations on public.liquidations;
create trigger liquidation_generate_treasury_destinations after update of estado on public.liquidations for each row execute function public.tesoreria_after_liquidation_approval();

create or replace function public.tesoreria_registrar_movimiento(p_unit text,p_type text,p_beneficiary text,p_concept text,p_amount numeric,p_destination_account text,p_date date,p_support_path text,p_liquidation_id uuid,p_supplier_id uuid,p_supplier_invoice_id uuid,p_idempotency_key text)
returns public.treasury_movements language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.treasury_movements%rowtype;b numeric;
begin
 if not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para Tesorería';end if;
 if p_unit='b2b' and p_type not in('pago_proveedor','otra_obligacion_b2b') then raise exception 'Tipo no permitido para Saldo B2B';end if;
 if p_unit='tercerizacion' and p_type not in('gasto_administrativo','gasto_financiero','impuesto','retiro_socios','otro_movimiento_autorizado') then raise exception 'Tipo no permitido para Saldo Tercerización';end if;
 if p_amount is null or p_amount<=0 or p_date is null or nullif(btrim(p_concept),'') is null or nullif(btrim(p_beneficiary),'') is null or nullif(btrim(p_destination_account),'') is null or p_idempotency_key is null then raise exception 'Completa beneficiario, concepto, valor, cuenta, fecha e idempotencia';end if;
 if p_type='pago_proveedor' and (p_supplier_id is null or p_supplier_invoice_id is null) then raise exception 'Proveedor y factura son obligatorios';end if;
 select * into m from public.treasury_movements where idempotency_key=p_idempotency_key;if found then return m;end if;
 select balance into b from public.treasury_unit_balances where unit=p_unit for update;if p_amount>b then raise exception 'Saldo insuficiente para la unidad económica';end if;
 insert into public.treasury_movements(unit,direction,type,beneficiary,concept,amount,destination_account,movement_date,support_path,liquidation_id,supplier_id,supplier_invoice_id,status,requested_by,idempotency_key)
 values(p_unit,'debit',p_type,btrim(p_beneficiary),btrim(p_concept),p_amount,btrim(p_destination_account),p_date,nullif(btrim(coalesce(p_support_path,'')),''),p_liquidation_id,p_supplier_id,p_supplier_invoice_id,'pendiente',auth.uid(),p_idempotency_key) returning * into m;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'tesoreria_movimiento_preparado','treasury_movements',m.id,jsonb_build_object('unit',m.unit,'type',m.type,'amount',m.amount));return m;
end;$$;

create or replace function public.tesoreria_autorizar_movimiento(p_id uuid)
returns public.treasury_movements language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.treasury_movements%rowtype;
begin
 if not public.tiene_capacidad_aliados('aprobador') then raise exception 'Solo Óscar puede autorizar este movimiento';end if;
 update public.treasury_movements set authorized_by=auth.uid(),updated_at=now() where id=p_id and status='pendiente' returning * into m;
 if not found then raise exception 'Movimiento no disponible para autorización';end if;return m;
end;$$;

create or replace function public.tesoreria_cambiar_estado_movimiento(p_id uuid,p_status text,p_support_path text default null)
returns public.treasury_movements language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.treasury_movements%rowtype;balance_data jsonb;provider_payment jsonb;
begin
 if not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para Tesorería';end if;
 select * into m from public.treasury_movements where id=p_id for update;if not found then raise exception 'Movimiento no encontrado';end if;
 if m.status in('pagado','conciliado','anulado') then raise exception 'Movimiento inmutable; use reversión o ajuste';end if;
 if p_status='programado' and m.status='pendiente' then
  if m.type='retiro_socios' and m.authorized_by is null then raise exception 'Retiro de socios requiere autorización de Óscar';end if;
  update public.treasury_movements set status='programado',support_path=coalesce(nullif(btrim(coalesce(p_support_path,'')),''),support_path),updated_at=now() where id=m.id returning * into m;
 elsif p_status='pagado' and m.status='programado' then
  if nullif(btrim(coalesce(p_support_path,m.support_path,'')),'') is null then raise exception 'No se puede marcar Pagado sin soporte';end if;
  if m.type='retiro_socios' and (m.authorized_by is null or not public.tiene_capacidad_aliados('aprobador')) then raise exception 'Solo Óscar puede ejecutar el retiro autorizado';end if;
  balance_data:=public.tesoreria_aplicar_saldo(m.unit,'debit',m.amount,'movement:'||m.id);
  if m.type='pago_proveedor' then provider_payment:=public.registrar_pago_proveedor(m.supplier_invoice_id,m.amount,m.movement_date,'saldo_b2b',m.concept,coalesce(p_support_path,m.support_path),m.concept,m.id::text::uuid);end if;
  update public.treasury_movements set status='pagado',support_path=coalesce(p_support_path,support_path),balance_before=(balance_data->>'before')::numeric,balance_after=(balance_data->>'after')::numeric,paid_by=auth.uid(),updated_at=now() where id=m.id returning * into m;
 elsif p_status='conciliado' and m.status='pagado' then update public.treasury_movements set status='conciliado',updated_at=now() where id=m.id returning * into m;
 else raise exception 'Transición de Tesorería inválida';end if;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'tesoreria_movimiento_'||p_status,'treasury_movements',m.id,jsonb_build_object('unit',m.unit,'type',m.type,'amount',m.amount));
 return m;
end;$$;

create or replace function public.aliados_cambiar_estado_pago(p_id uuid,p_estado text,p_soporte_path text default null)
returns public.payment_orders language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.payment_orders%rowtype;previous text;event_name text;balance_data jsonb;movement_id uuid;
begin
 if not public.tiene_capacidad_aliados('revisor') then raise exception 'No autorizado para gestionar pagos';end if;
 select * into v from public.payment_orders where id=p_id for update;if not found then raise exception 'Pago no encontrado';end if;previous:=v.estado;
 if (v.estado,p_estado) not in (('pendiente','programado'),('programado','pagado'),('pagado','conciliado')) then raise exception 'Transición de pago inválida';end if;
 if p_estado='pagado' and (nullif(btrim(coalesce(p_soporte_path,v.soporte_path,'')),'') is null or v.bank_snapshot is null or v.valor<=0) then raise exception 'No se puede marcar Pagado sin soporte, valor, beneficiario y cuenta';end if;
 if p_estado in('pagado','conciliado') and not public.tiene_capacidad_aliados('aprobador') then raise exception 'Solo Óscar/aprobador puede confirmar el pago';end if;
 if p_estado='pagado' and v.payment_kind='ejecutivo' then
  balance_data:=public.tesoreria_aplicar_saldo('tercerizacion','debit',v.valor,'executive-payment:'||v.id);
  insert into public.treasury_movements(unit,direction,type,beneficiary,concept,amount,destination_account,movement_date,support_path,liquidation_id,payment_order_id,balance_before,balance_after,status,requested_by,authorized_by,paid_by,idempotency_key)
  select 'tercerizacion','debit','pago_ejecutivo',b.nombre,v.concept,v.valor,'Cuenta terminada en '||right(v.bank_snapshot->>'account_number',4),current_date,coalesce(p_soporte_path,v.soporte_path),v.liquidation_id,v.id,(balance_data->>'before')::numeric,(balance_data->>'after')::numeric,'pagado',auth.uid(),auth.uid(),auth.uid(),'executive-payment:'||v.id from public.liquidation_beneficiaries b where b.id=v.beneficiary_id on conflict(idempotency_key) do nothing returning id into movement_id;
 end if;
 update public.payment_orders set estado=p_estado,fecha_programada=case when p_estado='programado' then current_date else fecha_programada end,fecha_pagada=case when p_estado='pagado' then now() else fecha_pagada end,soporte_path=coalesce(nullif(btrim(coalesce(p_soporte_path,'')),''),soporte_path),paid_by=case when p_estado='pagado' then auth.uid() else paid_by end,updated_at=now() where id=p_id returning * into v;
 event_name:=case when p_estado='programado' then 'payment.scheduled' when p_estado='pagado' and v.payment_kind='ejecutivo' then 'treasury.executive_payment_completed' when p_estado='pagado' then 'treasury.ally_payment_completed' when p_estado='conciliado' then 'payment.completed' end;
 if event_name is not null then insert into public.liquidation_domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values(event_name,'payment',v.id,case when v.payment_kind='ejecutivo' then jsonb_build_object('payment_id',v.id,'liquidation_id',v.liquidation_id,'period',v.cutoff_snapshot,'bonuses',v.own_bonuses,'amount_paid',v.valor,'support',v.soporte_path) else jsonb_build_object('payment_id',v.id,'liquidation_id',v.liquidation_id,'platform',v.platform_snapshot,'cutoff',v.cutoff_snapshot,'operations',v.operations_count,'amount_paid',v.valor,'support',v.soporte_path) end,v.id||':'||p_estado) on conflict(idempotency_key) do nothing;end if;
 if not exists(select 1 from public.payment_orders where liquidation_id=v.liquidation_id and estado<>p_estado) then
  update public.liquidations set estado=case p_estado when 'programado' then 'programada' when 'pagado' then 'pagada' when 'conciliado' then 'conciliada' end,updated_at=now() where id=v.liquidation_id;
 end if;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid(),'aliados_pago_'||p_estado,'payment_orders',v.id,jsonb_build_object('anterior',previous,'nuevo',p_estado,'soporte_path',v.soporte_path));return v;
end;$$;

revoke all on function public.tesoreria_registrar_movimiento(text,text,text,text,numeric,text,date,text,uuid,uuid,uuid,text),public.tesoreria_autorizar_movimiento(uuid),public.tesoreria_cambiar_estado_movimiento(uuid,text,text) from public,anon;
grant execute on function public.tesoreria_registrar_movimiento(text,text,text,text,numeric,text,date,text,uuid,uuid,uuid,text),public.tesoreria_autorizar_movimiento(uuid),public.tesoreria_cambiar_estado_movimiento(uuid,text,text) to authenticated;

do $rls$ declare t text;begin
 foreach t in array array['treasury_unit_balances','liquidation_treasury_destinations','retail_b2b_compensations','treasury_movements'] loop
  execute format('alter table public.%I enable row level security',t);execute format('drop policy if exists treasury_select on public.%I',t);
  execute format('create policy treasury_select on public.%I for select to authenticated using(public.tiene_capacidad_aliados(''revisor''))',t);
  execute format('revoke all on public.%I from public,anon',t);execute format('revoke insert,update,delete on public.%I from authenticated',t);execute format('grant select on public.%I to authenticated',t);execute format('grant all on public.%I to service_role',t);
 end loop;
end;$rls$;
drop policy if exists soportes_aliados_insert on storage.objects;
create policy soportes_aliados_insert on storage.objects for insert to authenticated with check(bucket_id='soportes' and public.tiene_capacidad_aliados('revisor') and name ~ '^aliados/(originales|pagos|tesoreria)/[0-9a-f-]{36}\.(xlsx|xls|pdf|jpg|jpeg|png)$');
drop policy if exists soportes_aliados_select on storage.objects;
create policy soportes_aliados_select on storage.objects for select to authenticated using(bucket_id='soportes' and public.tiene_capacidad_aliados('revisor') and name ~ '^aliados/(originales|pagos|tesoreria)/');

commit;

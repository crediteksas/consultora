create role anon; create role authenticated; create role service_role; create schema kora_private;
 create table perfiles(id uuid primary key,activo bool,rol text);
 create table liquidations(id uuid primary key,frozen_at timestamptz);
 create table payment_orders(id uuid primary key,liquidation_id uuid,estado text,payment_kind text,authorized_by uuid,authorized_at timestamptz,fecha_pagada timestamptz,paid_by uuid,soporte_path text,historico_inicial bool default false,bank_snapshot jsonb,valor numeric,concept text,updated_at timestamptz);
 create table banco_creditek_cuentas(id uuid primary key,saldo_actual numeric,fecha_corte date,fecha_corte_at timestamptz);
 create table banco_creditek_movimientos(id uuid primary key default gen_random_uuid(),cuenta_id uuid,tipo text,monto numeric,saldo_antes numeric,saldo_despues numeric,fecha date,referencia text,soporte_path text,registrado_por uuid,fuente_tabla text,fuente_id uuid,ocurrido_at timestamptz,solicitud_id uuid,
 constraint banco_creditek_movimientos_tipo_check check(tipo in ('pago_aliado','ingreso_plataforma')),
 constraint banco_creditek_movimientos_check check((tipo='pago_aliado' and saldo_despues=saldo_antes-monto) or (tipo='ingreso_plataforma' and saldo_despues=saldo_antes+monto)));
 create table treasury_movements(payment_order_id uuid);
 create table credit_portfolio_obligations(id uuid primary key,payment_order_id uuid,outstanding_amount numeric,original_amount numeric,ally_paid_at timestamptz,updated_at timestamptz);
 create table credit_repayments(obligation_id uuid);create table credit_collection_events(obligation_id uuid);
 create table liquidation_domain_events(id uuid default gen_random_uuid(),aggregate_id uuid,event_type text,published_at timestamptz);
 create table audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
 create function kora_private.banco_creditek_asentar(text,numeric,text,uuid,timestamptz,text,text,uuid) returns boolean language plpgsql set search_path=public as $$declare c banco_creditek_cuentas%rowtype;begin if exists(select 1 from banco_creditek_movimientos where fuente_tabla=$3 and fuente_id=$4) then return false;end if;select * into c from banco_creditek_cuentas limit 1 for update;insert into banco_creditek_movimientos(cuenta_id,tipo,monto,saldo_antes,saldo_despues,fuente_tabla,fuente_id) values(c.id,$1,$2,c.saldo_actual,c.saldo_actual-$2,$3,$4);update banco_creditek_cuentas set saldo_actual=saldo_actual-$2 where id=c.id;return true;end$$;
 create function kora_private.banco_creditek_pago_trigger() returns trigger language plpgsql security definer set search_path='' as $$begin return new;end$$;
 create trigger banco_creditek_pago_real after update of fecha_pagada,estado on payment_orders for each row execute function kora_private.banco_creditek_pago_trigger();
 insert into perfiles values('00000000-0000-4000-8000-000000000001',true,'gerencia');insert into liquidations values('00000000-0000-4000-8000-000000000002',now());
 insert into payment_orders values('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','conciliado','aliado','00000000-0000-4000-8000-000000000001',now(),now(),'00000000-0000-4000-8000-000000000001','soporte-original',false,'{"account_number":"12345"}',379575,'Orden',now());
 insert into banco_creditek_cuentas values('00000000-0000-4000-8000-000000000004',43053.50,'2026-10-01',null);
 insert into banco_creditek_movimientos(id,cuenta_id,tipo,monto,saldo_antes,saldo_despues,soporte_path,fuente_tabla,fuente_id,ocurrido_at) values('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000004','pago_aliado',379575,886628.50,507053.50,'soporte-original','payment_orders','00000000-0000-4000-8000-000000000003',now());
 insert into credit_portfolio_obligations values('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000003',596275,596275,now(),now());
 insert into liquidation_domain_events(aggregate_id,event_type) values('00000000-0000-4000-8000-000000000003','treasury.ally_payment_completed'),('00000000-0000-4000-8000-000000000003','payment.completed');

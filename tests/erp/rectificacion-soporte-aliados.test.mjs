import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const migration=await readFile(new URL('../../supabase/migrations/20261126192204_rectificacion_soporte_aliados.sql',import.meta.url),'utf8');
const actor='00000000-0000-4000-8000-000000000001',lot='00000000-0000-4000-8000-000000000002',order='00000000-0000-4000-8000-000000000003',bank='00000000-0000-4000-8000-000000000004',movement='00000000-0000-4000-8000-000000000005',obligation='00000000-0000-4000-8000-000000000006';
async function fixture(){
 const db=await PGlite.create();
 await db.exec(`create role anon; create role authenticated; create role service_role; create schema kora_private;
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
 insert into perfiles values('${actor}',true,'gerencia');insert into liquidations values('${lot}',now());
 insert into payment_orders values('${order}','${lot}','conciliado','aliado','${actor}',now(),now(),'${actor}','soporte-original',false,'{"account_number":"12345"}',379575,'Orden',now());
 insert into banco_creditek_cuentas values('${bank}',43053.50,'2026-10-01',null);
 insert into banco_creditek_movimientos(id,cuenta_id,tipo,monto,saldo_antes,saldo_despues,soporte_path,fuente_tabla,fuente_id,ocurrido_at) values('${movement}','${bank}','pago_aliado',379575,886628.50,507053.50,'soporte-original','payment_orders','${order}',now());
 insert into credit_portfolio_obligations values('${obligation}','${order}',596275,596275,now(),now());
 insert into liquidation_domain_events(aggregate_id,event_type) values('${order}','treasury.ally_payment_completed'),('${order}','payment.completed');`);
 await db.exec(migration);return db;
}
test('reverso auditado conserva el original y admite un giro futuro una sola vez',async()=>{
 const db=await fixture();try{
  const before=(await db.query('select to_jsonb(m) m from banco_creditek_movimientos m where id=$1',[movement])).rows[0].m;
  await db.query("select kora_private.rectificar_soporte_aliado($1,$2,$3,$4,379575,'soporte-original')",[order,movement,actor,'Soporte equivocado confirmado por Gerencia']);
  const payment=(await db.query('select * from payment_orders where id=$1',[order])).rows[0];
  assert.equal(payment.estado,'programado');assert.equal(payment.soporte_path,null);assert.equal(payment.authorized_by,actor);
  assert.equal(Number((await db.query('select saldo_actual from banco_creditek_cuentas')).rows[0].saldo_actual),422628.50);
  assert.deepEqual((await db.query('select to_jsonb(m) m from banco_creditek_movimientos m where id=$1',[movement])).rows[0].m,before);
  const record=(await db.query('select * from kora_private.rectificaciones_soporte_aliados')).rows[0];assert.equal(record.snapshot_orden.soporte_path,'soporte-original');assert.equal(record.eventos_previos.length,2);
  assert.equal((await db.query('select ally_paid_at from credit_portfolio_obligations')).rows[0].ally_paid_at,null);
  await assert.rejects(db.query("select kora_private.rectificar_soporte_aliado($1,$2,$3,$4,379575,'soporte-original')",[order,movement,actor,'Soporte equivocado confirmado por Gerencia']),/ya fue rectificada/);
  await db.query("update payment_orders set estado='pagado',fecha_pagada=now(),soporte_path='soporte-real' where id=$1",[order]);
  assert.equal(Number((await db.query('select saldo_actual from banco_creditek_cuentas')).rows[0].saldo_actual),43053.50);
  await db.query("update payment_orders set estado='conciliado' where id=$1",[order]);
  assert.equal((await db.query("select count(*)::int n from banco_creditek_movimientos where fuente_tabla='payment_orders_reintento' and fuente_id=$1",[order])).rows[0].n,1);
 }finally{await db.close();}
});
test('aborta íntegramente si ya hay movimientos de cartera o el evento fue publicado',async()=>{
 for(const kind of ['cartera','evento']){const db=await fixture();try{
  if(kind==='cartera')await db.query('insert into credit_repayments values($1)',[obligation]);else await db.query('update liquidation_domain_events set published_at=now()');
  await assert.rejects(db.query("select kora_private.rectificar_soporte_aliado($1,$2,$3,$4,379575,'soporte-original')",[order,movement,actor,'Soporte equivocado confirmado por Gerencia']),/requiere revisión/);
  assert.equal((await db.query('select estado from payment_orders')).rows[0].estado,'conciliado');assert.equal(Number((await db.query('select saldo_actual from banco_creditek_cuentas')).rows[0].saldo_actual),43053.50);
 }finally{await db.close();}}
});
test('rechaza un movimiento ajeno y no expone la rectificación a cuentas de API',async()=>{
 const db=await fixture();try{
  for(const role of ['anon','authenticated','service_role']){
   const r=(await db.query(`select has_function_privilege('${role}','kora_private.rectificar_soporte_aliado(uuid,uuid,uuid,text,numeric,text)','execute') allowed`)).rows[0];assert.equal(r.allowed,false);
  }
  await db.query("update banco_creditek_movimientos set soporte_path='otro-soporte' where id=$1",[movement]);
  await assert.rejects(db.query("select kora_private.rectificar_soporte_aliado($1,$2,$3,$4,379575,'soporte-original')",[order,movement,actor,'Soporte equivocado confirmado por Gerencia']),/no corresponde exactamente/);
  assert.equal((await db.query('select estado from payment_orders')).rows[0].estado,'conciliado');
  assert.equal((await db.query('select count(*)::int n from kora_private.rectificaciones_soporte_aliados')).rows[0].n,0);
 }finally{await db.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=fs.readFileSync('supabase/migrations/20260910185830_aliados_reversiones_y_recuperaciones.sql','utf8');
const actor='00000000-0000-4000-8000-000000000001';
async function setup(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema kora_private;create schema auth;
 grant usage on schema kora_private to authenticated;
 create function auth.uid() returns uuid language sql as $$select '${actor}'::uuid$$;
 create function tiene_capacidad_aliados(text) returns boolean language sql as $$select coalesce(current_setting('test.revisor',true),'true')='true'$$;
 create function es_autorizador_pagos() returns boolean language sql as $$select coalesce(current_setting('test.gerencia',true),'true')='true'$$;
 create function kora_private.krediya_estado_fuente(jsonb,text) returns text language sql as $$select lower($1->>$2)$$;
 create table perfiles(id uuid primary key);insert into perfiles values('${actor}');
 create table liquidation_beneficiaries(id uuid primary key default gen_random_uuid(),nombre text);
 create table liquidations(id uuid primary key default gen_random_uuid(),plataforma text default 'krediya',estado text default 'aprobada',fecha_corte date default '2026-09-10',frozen_at timestamptz default now());
 create table liquidation_operations(id uuid primary key default gen_random_uuid(),liquidation_id uuid,plataforma text default 'krediya',external_id text,cliente_documento text default '123',imei text default '456',origen_codigo text default 'A1',tipo_establecimiento text default 'aliado',reconocida boolean default true,normalized_data jsonb default '{"Estado del contrato":"FIRMADO"}');
 create table liquidation_calculations(id uuid primary key default gen_random_uuid(),operation_id uuid,pagamos numeric,pago_aliado numeric,total_bonos numeric,utilidad_creditek numeric,policy_snapshot jsonb);
 create table liquidation_bonuses(id uuid primary key default gen_random_uuid(),operation_id uuid,valor numeric);
 create table payment_orders(id uuid primary key default gen_random_uuid(),beneficiary_id uuid references liquidation_beneficiaries(id),liquidation_id uuid,valor numeric constraint payment_orders_valor_check check(valor>0),estado text,authorized_by uuid,authorized_at timestamptz,updated_at timestamptz,bank_snapshot jsonb default '{"account":"unchanged"}');
 create table payment_items(id uuid primary key default gen_random_uuid(),payment_order_id uuid,operation_id uuid,valor numeric);
 create table liquidation_incidents(operation_id uuid,tipo text,estado text default 'abierta',resolved_by uuid,resolved_at timestamptz,resolution text);
 create table audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
 alter table liquidation_operations add column establishment_name text,add column operation_at timestamptz;
 create table treasury_unit_balances(unit text primary key,balance numeric,updated_at timestamptz);
 insert into treasury_unit_balances values('tercerizacion',1000,now());
 create table treasury_movements(unit text,direction text,amount numeric,idempotency_key text,status text);
 create function tesoreria_aplicar_saldo(p_unit text,p_direction text,p_amount numeric,p_key text) returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
 declare b public.treasury_unit_balances%rowtype;after_value numeric;
 begin
 select * into b from public.treasury_unit_balances where unit=p_unit for update;
 if not found or p_amount<=0 then raise exception 'Movimiento de saldo inválido';end if;
 after_value:=case when p_direction='credit' then b.balance+p_amount else b.balance-p_amount end;
 if after_value<0 then raise exception 'Saldo insuficiente para la unidad económica';end if;
 update public.treasury_unit_balances set balance=after_value,updated_at=now() where unit=p_unit;
 return jsonb_build_object('before',b.balance,'after',after_value,'key',p_key);
 end;$$;
 create function kora_private.pago_con_autorizacion_lote(uuid) returns boolean language sql as $$select true$$;
 create function aliados_autorizar_pago(p_id uuid) returns payment_orders language plpgsql set search_path='public' as $$declare p payment_orders%rowtype;begin update payment_orders set estado='programado',authorized_by=auth.uid(),authorized_at=now() where id=p_id returning * into p;return p;end$$;`);
 await db.exec(sql);return db;
}
const row=async(db,q,p=[])=>(await db.query(q,p)).rows[0];
async function sale(db,{paid=true,principal=100,bonus=20,frozen=true}={}){
 const l=await row(db,`insert into liquidations(frozen_at) values(${frozen?'now()':'null'}) returning id`);
 const c=await row(db,"insert into liquidations(estado,frozen_at) values('importada',null) returning id");
 const code=crypto.randomUUID();
 const o=await row(db,'insert into liquidation_operations(liquidation_id,external_id) values($1,$2) returning id',[l.id,code]);
 const n=await row(db,`insert into liquidation_operations(liquidation_id,external_id,reconocida,normalized_data) values($1,$2,false,'{"Estado del contrato":"ANULADO"}') returning id`,[c.id,code]);
 await db.query(`insert into liquidation_calculations(operation_id,pagamos,pago_aliado,total_bonos,utilidad_creditek,policy_snapshot) values($1,$2,$3,$4,46.08,'{"provision":17.92,"gasto_financiero":1}')`,[o.id,principal+10,principal,bonus]);
 const ally=await row(db,"insert into liquidation_beneficiaries(nombre) values('Aliado') returning id");
 const exec=await row(db,"insert into liquidation_beneficiaries(nombre) values('Ejecutivo') returning id");
 const orders=[];
 for(const [b,v] of [[ally,principal],[exec,bonus]]){
  const p=await row(db,'insert into payment_orders(beneficiary_id,liquidation_id,valor,estado) values($1,$2,$3,$4) returning *',[b.id,l.id,v,paid?'pagado':'pendiente']);
  await db.query('insert into payment_items(payment_order_id,operation_id,valor) values($1,$2,$3)',[p.id,o.id,v]);orders.push(p);
 }
 return {o,n,l,c,ally,exec,orders};
}
test('reversión conserva pagos y cálculo, genera deuda por beneficiario; cruce 100 contra 200 deja giro 100',async()=>{
 const db=await setup();try{
 const s=await sale(db);const before=(await db.query('select * from payment_orders order by id')).rows;
 const r=await row(db,'select aliados_confirmar_reversion($1) id',[s.n.id]);
 assert.equal((await row(db,'select aliados_confirmar_reversion($1) id',[s.n.id])).id,r.id);
 assert.deepEqual((await db.query('select * from payment_orders order by id')).rows,before);
 assert.equal((await row(db,'select count(*)::int n from aliados_recuperaciones')).n,2);
 assert.equal(Number((await row(db,'select sum(importe-recuperado) n from aliados_recuperaciones')).n),120);
 const p=await row(db,"insert into payment_orders(beneficiary_id,liquidation_id,valor,estado) values($1,$2,200,'pendiente') returning id",[s.ally.id,s.c.id]);
 await assert.rejects(db.query('select aliados_autorizar_pago($1)',[p.id]),/anulación por cruzar/);
 await assert.rejects(db.query('select aliados_autorizar_pago_con_cruce($1,200)',[p.id]),/saldo cambió/);
 const preview=(await row(db,'select aliados_previsualizar_cruce($1) v',[p.id])).v;
 assert.deepEqual(preview,{pago:200,recuperacion:100,neto:100,saldo_por_cobrar:0});
 await db.query('select aliados_autorizar_pago_con_cruce($1,100)',[p.id]);
 await db.query('select aliados_autorizar_pago_con_cruce($1,100)',[p.id]);
 const result=await row(db,'select * from payment_orders where id=$1',[p.id]);
 assert.equal(Number(result.valor),100);assert.equal(result.estado,'programado');assert.equal(result.authorized_by,actor);
 assert.equal((await row(db,'select count(*)::int n from aliados_cruces_recuperacion')).n,1);
 assert.equal(Number((await row(db,'select sum(importe-recuperado) n from aliados_recuperaciones where beneficiary_id=$1',[s.exec.id])).n),20);
 assert.equal((await row(db,'select count(*)::int n from liquidation_calculations')).n,1);
 }finally{await db.close();}
});
test('cruce parcial: deuda 300, pago 100, cero giro y 200 por cobrar; nunca pagado sin desembolso',async()=>{
 const db=await setup();try{
 const s=await sale(db,{principal:300});await db.query('select aliados_confirmar_reversion($1)',[s.n.id]);
 const p=await row(db,"insert into payment_orders(beneficiary_id,liquidation_id,valor,estado) values($1,$2,100,'pendiente') returning id",[s.ally.id,s.c.id]);
 await db.query('select aliados_autorizar_pago_con_cruce($1,0)',[p.id]);await db.query('select aliados_autorizar_pago_con_cruce($1,0)',[p.id]);
 const result=await row(db,'select * from payment_orders where id=$1',[p.id]);
 assert.equal(Number(result.valor),0);assert.equal(result.estado,'anulado');assert.equal(result.authorized_at,null);
 assert.equal(Number((await row(db,'select importe-recuperado n from aliados_recuperaciones where beneficiary_id=$1',[s.ally.id])).n),200);
 }finally{await db.close();}
});
test('obligaciones aún no pagadas se cancelan sin crear dinero entregado ni cuentas por cobrar',async()=>{
 const db=await setup();try{
 const s=await sale(db,{paid:false});await db.query('select aliados_confirmar_reversion($1)',[s.n.id]);
 const claims=(await db.query('select * from aliados_recuperaciones')).rows;
 assert.ok(claims.every(d=>d.origen==='obligacion_cancelada'&&Number(d.recuperado)===Number(d.importe)));
 assert.ok((await db.query('select * from payment_orders')).rows.every(p=>p.estado==='anulado'&&Number(p.valor)===0));
 }finally{await db.close();}
});
test('entrada y anulación en mismo lote sin devengos: cero y trazabilidad',async()=>{
 const db=await setup();try{
 const l=await row(db,"insert into liquidations(estado,frozen_at) values('importada',null) returning id");
 const o=await row(db,"insert into liquidation_operations(liquidation_id,external_id) values($1,'S1') returning id",[l.id]);
 const c=await row(db,`insert into liquidation_operations(liquidation_id,external_id,reconocida,normalized_data) values($1,'S1',false,'{"Estado del contrato":"ANULADO"}') returning id`,[l.id]);
 await db.query('select aliados_confirmar_reversion($1)',[c.id]);
 assert.ok((await db.query('select reconocida from liquidation_operations')).rows.every(x=>!x.reconocida));
 assert.equal((await row(db,'select count(*)::int n from aliados_recuperaciones')).n,0);
 assert.equal((await row(db,'select tipo from aliados_reversiones')).tipo,'sin_desembolso');
 }finally{await db.close();}
});
test('identidad, autorización, fuentes incompletas y DML directo fallan sin efectos parciales',async()=>{
 const db=await setup();try{
 const s=await sale(db);
 await db.query("update liquidation_operations set cliente_documento='999' where id=$1",[s.n.id]);
 await assert.rejects(db.query('select aliados_confirmar_reversion($1)',[s.n.id]),/cliente, IMEI/);
 await db.query("update liquidation_operations set cliente_documento='123' where id=$1",[s.n.id]);
 await db.exec("select set_config('test.revisor','false',false)");
 await assert.rejects(db.query('select aliados_confirmar_reversion($1)',[s.n.id]),/No autorizado/);
 await db.exec("select set_config('test.revisor','true',false)");
 await db.exec("update liquidation_calculations set policy_snapshot='{}'");
 await assert.rejects(db.query('select aliados_confirmar_reversion($1)',[s.n.id]),/desglose original/);
 assert.equal((await row(db,'select count(*)::int n from aliados_reversiones')).n,0);
 await db.exec('set role authenticated');
 await assert.rejects(db.exec('delete from aliados_recuperaciones'),/permission denied/);
 }finally{await db.close();}
});

test('preview permite revisar, Gerencia confirma y el margen reversado no se puede retirar',async()=>{
 const db=await setup();try{
 const s=await sale(db);
 await db.query("insert into treasury_movements values('tercerizacion','credit',100,$1,'pagado')",['commission-operation:'+s.o.id]);
 await db.exec("select set_config('test.gerencia','false',false)");
 const p=(await row(db,'select aliados_previsualizar_reversion($1) v',[s.n.id])).v;
 assert.equal(p.pagos.length,2);assert.equal(Number(p.calculo.total_bonos),20);
 await assert.rejects(db.query('select aliados_confirmar_reversion($1)',[s.n.id]),/Gerencia/);
 await db.exec("select set_config('test.gerencia','true',false)");
 await db.query('select aliados_confirmar_reversion($1)',[s.n.id]);
 assert.equal(Number((await row(db,'select treasury_adjustment from aliados_reversiones')).treasury_adjustment),100);
 await assert.rejects(db.query("select tesoreria_aplicar_saldo('tercerizacion','debit',950,'withdraw')"),/anulaciones/);
 await db.query("select tesoreria_aplicar_saldo('tercerizacion','debit',900,'withdraw')");
 await db.query("select tesoreria_aplicar_saldo('tercerizacion','credit',10,'deposit')");
 assert.equal(Number((await row(db,'select balance from treasury_unit_balances')).balance),110);
 await assert.rejects(db.query('insert into payment_items(operation_id,valor) values($1,100)',[s.o.id]),/anulada/);
 await db.query('update liquidation_operations set reconocida=true where id=$1',[s.o.id]);
 assert.equal((await row(db,'select reconocida from liquidation_operations where id=$1',[s.o.id])).reconocida,false);
 }finally{await db.close();}
});

test('orden mixta pendiente resta solo el crédito cancelado y obliga a reautorizar el neto',async()=>{
 const db=await setup();try{
 const s=await sale(db,{paid:false});
 await db.query('update payment_orders set valor=valor+200 where id=$1',[s.orders[0].id]);
 await db.query('select aliados_confirmar_reversion($1)',[s.n.id]);
 const p=await row(db,'select * from payment_orders where id=$1',[s.orders[0].id]);
 assert.equal(Number(p.valor),200);assert.equal(p.estado,'pendiente');assert.equal(p.recovery_review_required,true);
 await assert.rejects(db.query('select aliados_autorizar_pago($1)',[p.id]),/anulación por cruzar/);
 await db.query('select aliados_autorizar_pago_con_cruce($1,200)',[p.id]);
 await assert.rejects(db.query("update payment_orders set estado='rechazado' where id=$1",[p.id]),/cruce contable/);
 await assert.rejects(db.query('update payment_orders set valor=300 where id=$1',[p.id]),/cruce contable/);
 }finally{await db.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const original=readFileSync('supabase/migrations/20260923193010_addi_compensaciones_tras_conciliacion.sql','utf8');
const fn=original.slice(original.indexOf('create or replace function compensaciones_private.aplicar'),original.lastIndexOf('commit;'));
const migration=readFileSync('supabase/migrations/20261001150721_compensaciones_liquidaciones_conciliadas.sql','utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('PayJoy/ALO conciliadas conservan autorización: compensar una vez, reintentar sin duplicar y rechazar falta de autorización',async()=>{
 const db=await PGlite.create();try{
 await db.exec(`create schema auth;create schema compensaciones_private;
 create function auth.uid() returns uuid language sql as $$select '${id(1)}'::uuid$$;
 create table perfiles(id uuid primary key,activo boolean,rol text);
 insert into perfiles values('${id(1)}',true,'auditoria');
 create function tiene_capacidad_aliados(text) returns boolean language sql as $$select true$$;
 create table liquidations(id uuid primary key,estado text,frozen_at timestamptz,approved_at timestamptz,approved_by uuid);
 insert into liquidations values('${id(2)}','conciliada',now(),now(),'${id(3)}');
 create table retail_b2b_compensations(id uuid primary key,liquidation_id uuid,store_code text,platform text,imei text,compensation_value numeric,outsourcing_commission numeric default 0,cutoff_date date,addi_liquidacion_id uuid,reversed_at timestamptz,applied_at timestamptz,applied_by uuid,account_balance_before numeric,account_balance_after numeric);
 insert into retail_b2b_compensations(id,liquidation_id,store_code,platform,compensation_value) values('${id(4)}','${id(2)}','CK-08','payjoy',447020),('${id(5)}','${id(2)}','CK-08','payjoy',284500),('${id(6)}','${id(2)}','CK-06','alo',312120);
 create table addi_liquidaciones(id uuid,cobro_expected_id uuid,estado text,neto_estimado numeric,pago_tienda numeric,utilidad_creditek numeric,consecutivo bigint);
 create table cobros_expected(id uuid,estado text,importe numeric);
 create table cobros_allocations(id uuid,deposit_id uuid,expected_id uuid,importe numeric,estado text);
 create table cobros_deposits(id uuid,estado text);
 create table cuenta_corriente(tienda_codigo text,tipo text,concepto text,monto numeric,referencia_tipo text,referencia_id text,usuario uuid);
 create table treasury_movements(unit text,direction text,type text,beneficiary text,concept text,amount numeric,movement_date date,liquidation_id uuid,compensation_id uuid,balance_before numeric,balance_after numeric,status text,requested_by uuid,idempotency_key text unique);
 create table audit_log(usuario uuid,accion text,tabla text,registro_id uuid,detalle jsonb);
 create table balance(value numeric);insert into balance values(0);
 create function tesoreria_aplicar_saldo(text,text,numeric,text) returns jsonb language plpgsql as $$declare b numeric;begin select value into b from public.balance;update public.balance set value=value+$3;return jsonb_build_object('before',b,'after',b+$3);end$$;
 `);
 await db.exec(fn);
 const apply=()=>db.query('select compensaciones_private.aplicar($1) n',[[id(4),id(5),id(6)]]);
 await assert.rejects(apply(),/La liquidación no está autorizada/); // reproduces production
 await db.exec(migration);
 for(const field of ['approved_at','approved_by','frozen_at']){
   await db.exec('begin');await db.exec(`update liquidations set ${field}=null`);
   await assert.rejects(apply(),/La liquidación no está autorizada/);await db.exec('rollback');
 }
 for(const state of ['borrador','anulada','rechazada']){
   await db.query('update liquidations set estado=$1',[state]);await assert.rejects(apply(),/La liquidación no está autorizada/);
 }
 await db.exec("update liquidations set estado='conciliada'");
 assert.equal((await apply()).rows[0].n,3);assert.equal((await apply()).rows[0].n,0);
 assert.equal((await db.query('select value from balance')).rows[0].value,'1043640');
 assert.equal((await db.query('select count(*)::int n from cuenta_corriente')).rows[0].n,3);
 assert.equal((await db.query("select count(*)::int n from treasury_movements where direction='debit'")).rows[0].n,0);
 assert.equal((await db.query('select estado from liquidations')).rows[0].estado,'conciliada');
 }finally{await db.close();}
});

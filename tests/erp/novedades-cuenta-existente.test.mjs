import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
test('sincroniza solo cuenta válida y orden existente, audita una vez y no modifica pagos',async()=>{
 const db=new PGlite();try{
 await db.exec(`create schema kora_private;create schema auth;create role anon;create role authenticated;
 create function auth.uid() returns uuid language sql as $$select null::uuid$$;
 create table liquidation_incidents(id uuid,operation_id uuid,estado text,tipo text,resolution text,resolved_at timestamptz,resolved_by uuid);
 create table liquidation_operations(id uuid,liquidation_id uuid,tipo_establecimiento text,reconocida boolean,origen_codigo text);
 create table liquidation_beneficiaries(id uuid,activo boolean,tipo text,identificacion text);
 create table beneficiary_bank_accounts(id uuid,beneficiary_id uuid,activo boolean,validada boolean);
 create table payment_items(operation_id uuid,payment_order_id uuid,bonus_id uuid,concepto text);
 create table payment_orders(id uuid,liquidation_id uuid,beneficiary_id uuid,bank_account_id uuid,estado text,valor numeric);
 create table audit_log(usuario uuid,accion text,tabla text,registro_id text,detalle jsonb);
 create function aliados_beneficiario_de_comercio(text) returns uuid language sql as $$select '${id(1)}'::uuid$$;
 create function aliados_completar_pagos_beneficiario(p_beneficiary_id uuid) returns integer language plpgsql as $$declare v_completados int:=0;begin return v_completados;end$$;
 create function tesoreria_guardar_cliente_cuenta(text,uuid,text,text,text,text,text,boolean) returns jsonb language plpgsql as $$declare v_holder liquidation_beneficiaries%rowtype;v_account beneficiary_bank_accounts%rowtype;begin return jsonb_build_object('ok',true,'beneficiary_id',v_holder.id,'bank_account_id',v_account.id);end$$;
 insert into liquidation_beneficiaries values('${id(1)}',true,'aliado','123456');
 insert into beneficiary_bank_accounts values('${id(2)}','${id(1)}',true,true),('${id(3)}','${id(1)}',true,false);
 `);
 for(let n=10;n<16;n++){
 await db.query('insert into liquidation_operations values($1,$2,$3,true,$4)',[id(n),id(99),'aliado','local']);
 await db.query('insert into liquidation_incidents values($1,$2,$3,$4,null,null,null)',[id(n+100),id(n),'abierta',n===15?'otro_error':'beneficiario_sin_identificacion']);
 if(n!==14){
 await db.query('insert into payment_orders values($1,$2,$3,$4,$5,427500)',[id(n+200),id(99),id(n===13?9:1),id(n===11?3:2),n===12?'pagada':'pendiente']);
 await db.query("insert into payment_items values($1,$2,null,'pago_aliado')",[id(n),id(n+200)]);
 }
 }
 const snapshot=async()=>(await db.query('select jsonb_agg(p order by id) v from payment_orders p')).rows;
 const before=await snapshot();
 await db.exec(readFileSync('supabase/migrations/20260921200900_sincronizar_novedades_cuenta_aliados.sql','utf8'));
 assert.deepEqual(await snapshot(),before);
 const closed=(await db.query("select operation_id from liquidation_incidents where estado='resuelta'")).rows;
 assert.deepEqual(closed,[{operation_id:id(10)}]);
 assert.equal((await db.query('select count(*)::int n from audit_log')).rows[0].n,1);
 await db.query('select aliados_completar_pagos_beneficiario($1)',[id(1)]);
 assert.equal((await db.query('select count(*)::int n from audit_log')).rows[0].n,1);
 await db.exec(`update beneficiary_bank_accounts set validada=true where id='${id(3)}'`);
 await db.query('select aliados_completar_pagos_beneficiario($1)',[id(1)]);
 assert.equal((await db.query("select count(*)::int n from liquidation_incidents where estado='resuelta'")).rows[0].n,2);
 assert.deepEqual(await snapshot(),before);
 await db.exec('grant usage on schema kora_private to authenticated;set role authenticated');
 await assert.rejects(db.query('select kora_private.resolver_novedades_cuenta_existente(null)'),/permission denied/);
 }finally{await db.close();}
});

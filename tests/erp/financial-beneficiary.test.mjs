import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
const sql=readFileSync('supabase/migrations/20260930220302_financial_beneficiary_reuse.sql','utf8');
const maite='d1782db6-bacc-4caf-af6f-ce1b8d1c0391';
const oscar='6de0ad26-64af-4966-8cd9-d468880af627';
async function fixture(){const db=await PGlite.create();await db.exec(`
 create role anon;create role authenticated;create schema auth;create schema kora_private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.es_controlador_financiero() returns boolean language sql as $$select auth.uid() in ('${maite}','${oscar}')$$;
 create table liquidation_beneficiaries(id uuid primary key default gen_random_uuid(),tipo text,nombre text,identificacion text,activo boolean,unique(tipo,identificacion));
 create table beneficiary_bank_accounts(id uuid primary key default gen_random_uuid(),beneficiary_id uuid references liquidation_beneficiaries,
 banco text not null,tipo_cuenta text not null,numero_cuenta text not null,validada boolean not null default false,
 validada_por uuid,validada_at timestamptz,activo boolean default true,unique(beneficiary_id,numero_cuenta));
 create table financial_recurring_templates(id uuid default gen_random_uuid(),beneficiary text,beneficiary_document text,destination_account text,active boolean);
 create table financial_entries(id uuid default gen_random_uuid(),beneficiary text,amount numeric,destination_account text,status text);
 create table audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
 grant usage on schema auth,kora_private to authenticated;
 `);await db.exec(sql);await db.exec(`set request.jwt.claim.sub='${maite}'`);return db;}
const save=(db,id=null,account=null,name='Persona prueba',doc='12345678',bank='Bancolombia',type='Ahorros',number='0012345678')=>
 db.query('select public.financial_beneficiary_save($1,$2,$3,$4,$5,$6,$7) as person',[id,account,name,doc,bank,type,number]).then(r=>r.rows[0].person);

test('ficha: se crea una vez y se reutiliza sin repetir ni modificar pagos',async()=>{
 const db=await fixture();try{
 await db.exec("insert into financial_entries(beneficiary,amount,destination_account,status) values('Persona prueba',400000,'CUENTA ANTIGUA','aprobado')");
 const p=await save(db);const again=await save(db);assert.equal(again.beneficiaryId,p.beneficiaryId);assert.equal(again.accountId,p.accountId);
 assert.equal((await db.query('select count(*)::int n from liquidation_beneficiaries')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from audit_log')).rows[0].n,1);
 const entry=(await db.query('select * from financial_entries')).rows[0];assert.equal(entry.destination_account,'CUENTA ANTIGUA');assert.equal(entry.amount,'400000');assert.equal(entry.status,'aprobado');
 const list=(await db.query('select public.financial_beneficiaries_list() as people')).rows[0].people;assert.equal(list.length,1);assert.equal(list[0].accountType,'Ahorros');
 }finally{await db.close();}
});
test('ficha: una ficha incompleta se completa; cambios a una cuenta existente se rechazan',async()=>{
 const db=await fixture();try{
 const {rows}=await db.query("insert into liquidation_beneficiaries(tipo,nombre,identificacion,activo) values('ejecutivo','Persona prueba','EJECUTIVO-TEMP-TEST',true) returning id");
 const p=await save(db,rows[0].id);assert.equal(p.document,'12345678');
 await assert.rejects(save(db,p.beneficiaryId,p.accountId,'Persona prueba','12345678','Nequi'),/cuenta cambió/);
 await assert.rejects(save(db,p.beneficiaryId,p.accountId,'Otra persona'),/otra persona/);
 await assert.rejects(save(db,p.beneficiaryId,null,'Persona prueba','12345678','Bancolombia','Ahorros','9999999999'),/ya tiene cuenta/);
 await db.query('update beneficiary_bank_accounts set activo=false where id=$1',[p.accountId]);
 await assert.rejects(save(db,p.beneficiaryId,p.accountId),/no está disponible/);
 }finally{await db.close();}
});
test('ficha: exige datos completos y usuario autorizado; anon no ejecuta RPC',async()=>{
 const db=await fixture();try{
 await assert.rejects(save(db,null,null,'Persona prueba','BAD'),/Completa/);
 await assert.rejects(save(db,null,null,'Persona prueba','12345678','','Ahorros','0012345678'),/Completa/);
 await db.exec("set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'");
 await assert.rejects(save(db),/Solo Maite/);await assert.rejects(db.query('select public.financial_beneficiaries_list()'),/Solo Maite/);
 const perms=await db.query("select has_function_privilege('anon','public.financial_beneficiary_save(uuid,uuid,text,text,text,text,text,uuid)','execute') allowed");assert.equal(perms.rows[0].allowed,false);
 const funcs=await db.query("select prosecdef from pg_proc where pronamespace='public'::regnamespace and proname like 'financial_beneficiar%'");assert.ok(funcs.rows.every(f=>!f.prosecdef));
 }finally{await db.close();}
});
test('ficha antigua sin documento se completa una vez sin alterar su obligación y se desvincula al cambiar persona',async()=>{
 const db=await fixture();try{
 const t=(await db.query("insert into financial_recurring_templates(beneficiary,destination_account,active) values('Persona prueba','0012345678',true) returning id")).rows[0];
 await db.query("select public.financial_beneficiary_save(null,null,'Persona prueba','12345678','Bancolombia','Ahorros','0012345678',$1)",[t.id]);
 const people=(await db.query('select public.financial_beneficiaries_list() as people')).rows[0].people;
 assert.equal(people.length,1);assert.deepEqual(people[0].templateIds,[t.id]);
 const unchanged=(await db.query('select * from financial_recurring_templates')).rows[0];
 assert.equal(unchanged.beneficiary_document,null);assert.equal(unchanged.destination_account,'0012345678');
 await db.query("update financial_recurring_templates set beneficiary='Otra persona' where id=$1",[t.id]);
 assert.equal((await db.query('select beneficiary_id from financial_recurring_templates')).rows[0].beneficiary_id,null);
 }finally{await db.close();}
});
test('selector reutiliza cuenta completa, no inventa el banco de una cuenta antigua y conserva varias cuentas',()=>{
 const context={};context.globalThis=context;vm.runInNewContext(readFileSync('creditek/erp/payment-destination.js','utf8'),context);
 vm.runInNewContext(readFileSync('creditek/erp/financial-beneficiary-picker.js','utf8'),context);
 const D=context.KoraFinancialBeneficiary;
 const p={beneficiaryId:'1',name:'Persona prueba',document:'12345678',bank:'Bancolombia',accountType:'Ahorros',number:'0012345678',verified:true};
 assert.equal(D.complete(p),true);assert.equal(D.complete({...p,verified:false}),false);
 const rows=D.uniqueRows([p,{...p,accountId:'2',number:'2222222222'},{name:p.name,document:p.document,destination:'0012345678'}]);
 assert.equal(rows.length,2);
 const legacy=D.uniqueRows([{name:p.name,document:p.document,destination:'0012345678'}])[0];assert.equal(legacy.bank,'');assert.equal(D.complete(legacy),false);
});

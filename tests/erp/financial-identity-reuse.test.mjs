import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=readFileSync('supabase/migrations/20261001024403_financial_entries_reuse_existing_identity.sql','utf8');
async function fixture(){
 const db=await PGlite.create();
 await db.exec(`create role anon;create role authenticated;create schema kora_private;
 create table liquidation_beneficiaries(id uuid primary key default gen_random_uuid(),nombre text,identificacion text,activo boolean default true);
 create table beneficiary_bank_accounts(id uuid primary key default gen_random_uuid(),beneficiary_id uuid,banco text,tipo_cuenta text,numero_cuenta text,activo boolean default true,validada boolean default true);
 create table financial_recurring_templates(id uuid primary key default gen_random_uuid(),beneficiary_id uuid,beneficiary text,beneficiary_document text,destination_account text);
 create table financial_entries(id uuid primary key default gen_random_uuid(),template_id uuid,beneficiary text,beneficiary_document text,destination_account text,amount numeric,status text,paid_at timestamptz,paid_by uuid);
 create table payment_destination_corrections(item_id uuid,item_kind text,status text,proposed_document text,proposed_account text,original_document text,original_account text,original_beneficiary text,prepared_at timestamptz);
 insert into liquidation_beneficiaries(nombre,identificacion) values('Persona registrada','900.123.456-7');
 insert into beneficiary_bank_accounts(beneficiary_id,banco,tipo_cuenta,numero_cuenta) select id,'Banco existente','ahorros','0012345678' from liquidation_beneficiaries;
 insert into financial_entries(beneficiary,beneficiary_document,destination_account,amount,status) values('Histórico','9001234567','ANTIGUO',100,'pagado');`);
 await db.exec(sql);return db;
}
const entry=(db,doc='9001234567',account=null)=>db.query("insert into financial_entries(beneficiary,beneficiary_document,destination_account,amount,status) values('Bono persona',$1,$2,123,'pendiente_aprobacion') returning *",[doc,account]).then(r=>r.rows[0]);
test('cédula/NIT reutiliza identidad y cuenta para nuevos conceptos; conserva importes, aprobación e histórico',async()=>{
 const db=await fixture();try{
 const r=await entry(db);assert.equal(r.beneficiary,'Persona registrada');assert.equal(r.beneficiary_document,'900.123.456-7');assert.equal(r.destination_account,'Banco existente · Ahorros · 0012345678');assert.equal(r.amount,'123');assert.equal(r.status,'pendiente_aprobacion');
 assert.equal((await db.query("select destination_account from financial_entries where status='pagado'")).rows[0].destination_account,'ANTIGUO');
 assert.equal((await db.query('select count(*)::int n from liquidation_beneficiaries')).rows[0].n,1);
 const explicit=await entry(db,'9001234567','Otro banco · Corriente · 9999999999');assert.equal(explicit.destination_account,'Otro banco · Corriente · 9999999999');
 }finally{await db.close();}
});
test('varias cuentas requieren elección; número antiguo exacto recupera banco y tipo; desconocidos no se inventan',async()=>{
 const db=await fixture();try{
 await db.exec("insert into beneficiary_bank_accounts(beneficiary_id,banco,tipo_cuenta,numero_cuenta) select id,'Segundo banco','corriente','9876543210' from liquidation_beneficiaries");
 assert.equal((await entry(db)).destination_account,null);
 assert.equal((await entry(db,'9001234567','0012345678')).destination_account,'Banco existente · Ahorros · 0012345678');
 assert.equal((await entry(db,'9001234567','1111111111')).destination_account,'1111111111');
 assert.equal((await entry(db,'11111111')).destination_account,null);
 await db.exec("insert into liquidation_beneficiaries(nombre,identificacion) values('Duplicada','9001234567')");
 assert.equal((await entry(db,'9001234567','0012345678')).destination_account,'0012345678');
 }finally{await db.close();}
});
test('obligación vinculada recupera documento, no usa cuentas inactivas y funciones internas no son RPC públicas',async()=>{
 const db=await fixture();try{
 await db.exec("insert into financial_recurring_templates(beneficiary_id) select id from liquidation_beneficiaries");
 const r=await db.query("insert into financial_entries(template_id,beneficiary,destination_account,status) select id,'Persona antigua','0012345678','pendiente_aprobacion' from financial_recurring_templates returning *");
 assert.equal(r.rows[0].beneficiary_document,'900.123.456-7');assert.equal(r.rows[0].destination_account,'Banco existente · Ahorros · 0012345678');
 await db.exec('update beneficiary_bank_accounts set activo=false');assert.equal((await entry(db)).destination_account,null);
 const perms=await db.query("select has_function_privilege('anon','kora_private.financial_existing_destination(text,text)','execute') a,has_function_privilege('authenticated','kora_private.financial_existing_destination(text,text)','execute') b");assert.equal(perms.rows[0].a,false);assert.equal(perms.rows[0].b,false);
 }finally{await db.close();}
});

test('la obligación conserva los datos ya preparados y no vuelve a generar la quincena incompleta',async()=>{
 const db=await fixture();try{
 const t=(await db.query("insert into financial_recurring_templates(beneficiary,beneficiary_document,destination_account) values('Persona registrada',null,'0012345678') returning id")).rows[0];
 const e=(await db.query("insert into financial_entries(template_id,beneficiary,beneficiary_document,destination_account,status) values($1,'Persona registrada','900.123.456-7','Banco existente · Ahorros · 0012345678','aprobado') returning id",[t.id])).rows[0];
 await db.query("insert into payment_destination_corrections values($1,'financial_entry','confirmado','900.123.456-7','Banco existente · Ahorros · 0012345678',null,'0012345678','Persona registrada',now())",[e.id]);
 await db.exec(sql.slice(sql.indexOf('with prepared as (')));
 const updated=(await db.query('select * from financial_recurring_templates where id=$1',[t.id])).rows[0];
 assert.equal(updated.beneficiary_document,'900.123.456-7');assert.equal(updated.destination_account,'Banco existente · Ahorros · 0012345678');
 await db.query("update financial_recurring_templates set destination_account='Otra cuenta elegida' where id=$1",[t.id]);
 await db.exec(sql.slice(sql.indexOf('with prepared as (')));
 assert.equal((await db.query('select destination_account from financial_recurring_templates where id=$1',[t.id])).rows[0].destination_account,'Otra cuenta elegida');
 }finally{await db.close();}
});

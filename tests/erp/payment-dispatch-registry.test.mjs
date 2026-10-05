import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const sql=readFileSync('supabase/migrations/20261001025844_payment_dispatch_registry.sql','utf8');
const actor='6de0ad26-64af-4966-8cd9-d468880af627';
const maite='d1782db6-bacc-4caf-af6f-ce1b8d1c0391';
const supplierMigration=readFileSync('supabase/migrations/20261005220600_supplier_bank_payment_dispatch.sql','utf8');
const completeToday=readFileSync('scripts/maintenance/completar-op-000006-proveedores-20261005.sql','utf8');
async function fixture(){const db=await PGlite.create();await db.exec(`
 create role anon;create role authenticated;create schema auth;create schema kora_private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function es_controlador_financiero() returns boolean language sql as $$select auth.uid() in ('${actor}'::uuid,'${maite}'::uuid)$$;
 create function tiene_capacidad_aliados(text) returns boolean language sql as $$select auth.uid()='${actor}'::uuid$$;
 create table perfiles(id uuid primary key,nombre text,rol text,activo boolean default true);
 insert into perfiles values('${actor}','Gerencia','gerencia',true),('${maite}','Maite','auditoria',true);
 create table proveedores(id uuid primary key default gen_random_uuid(),nombre text,nit text,activo boolean default true);
 create table banco_creditek_pagos_proveedor(id uuid primary key default gen_random_uuid(),proveedor_id uuid references proveedores,
  monto numeric,concepto text,estado text default 'autorizado',autorizado_por uuid default '${actor}',autorizado_at timestamptz default now(),
  pagado_por uuid,pagado_at timestamptz,soporte_path text);
 create table banco_creditek_cuentas(id uuid primary key default gen_random_uuid(),saldo_actual numeric);
 insert into banco_creditek_cuentas(saldo_actual) values(20000000);
 create table banco_creditek_aplicaciones_proveedor(solicitud_id uuid,monto numeric);
 create table financial_entries(id uuid primary key default gen_random_uuid(),status text default 'aprobado',approved_by uuid default '${actor}',approved_at timestamptz default now(),paid_at timestamptz,support_path text,entry_type text default 'gasto',business_unit text default 'aliados',category text default 'nomina',due_date date default current_date,beneficiary text default 'Persona',beneficiary_document text default '12345678',destination_account text default 'Nequi · Ahorros · 3001234567',amount numeric,concept text default 'Nómina');
 create table treasury_movements(id uuid primary key default gen_random_uuid(),status text default 'programado',direction text default 'debit',authorized_by uuid default '${actor}',support_path text,paid_by uuid,unit text default 'tercerizacion',movement_date date default current_date,aliados_gasto_id uuid,beneficiary text,beneficiary_document text default '12345678',destination_account text default 'Nequi · Ahorros · 3001234567',amount numeric,concept text);
 create table aliados_gastos_operativos(id uuid primary key,plataforma text);
 create table liquidations(id uuid primary key default gen_random_uuid(),estado text default 'aprobada',frozen_at timestamptz default now(),approved_at timestamptz default now(),plataforma text default 'payjoy');
 create table payment_orders(id uuid primary key,estado text default 'programado',authorized_by uuid default '${actor}',authorized_at timestamptz default now(),historico_inicial boolean default false,recovery_review_required boolean default false,soporte_path text,fecha_pagada timestamptz,liquidation_id uuid,bank_snapshot jsonb default '{"bank":"Nequi","account_type":"ahorros","account_number":"3001234567","holder":"Persona","holder_identification":"12345678"}',valor numeric,concept text default 'Bono');
 create table payment_destination_corrections(item_id uuid,status text,item_kind text);
 create table audit_log(id bigint generated always as identity,usuario text,accion text,tabla text,registro_id text,detalle jsonb,created_at timestamptz default now());
 grant usage on schema auth,kora_private to authenticated;
 insert into treasury_movements(beneficiary,concept,amount,aliados_gasto_id) values
 ('Lujo red sas','Gasto Aliados — Bono alianza',20000,gen_random_uuid()),('María vasco','Gasto Aliados — Bono estrategia',20000,gen_random_uuid()),('Ingris Tatiana beltran','Gasto Aliados — Saldo pendiente',33200,gen_random_uuid()),('Ingrid Cristina ramos','Gasto Aliados — Bono estrategia',20000,gen_random_uuid());
 insert into liquidations default values;
 `);
 const values=[['d2a8',465000],['c722',10000],['fa05',912000],['f8ff',40000],['2ab8',392000],['8151',280600],['0abe',90000],['fa7b',1035895],['e06e',2359072],['0cea',601805],['baab',855680],['5431',270000],['5447',540000],['3fcd',1246700]];
 for(const [suffix,amount] of values)await db.query("insert into payment_orders(id,liquidation_id,valor) select $1,id,$2 from liquidations",['00000000-0000-4000-8000-00000000'+suffix,amount]);
 for(const [suffix,amount] of [['4918',550000],['725e',400000],['088c',750000]])await db.query('insert into financial_entries(id,amount) values($1,$2)',['00000000-0000-4000-8000-00000000'+suffix,amount]);
 await db.exec(sql);await db.exec(supplierMigration);await db.exec(`set request.jwt.claim.sub='${actor}'`);return db;
}
async function newRow(db){const r=await db.query('insert into financial_entries(amount) values(500) returning id');return (await db.query("select kora_private.payment_dispatch_snapshot('FIN-'||$1::uuid) as r",[r.rows[0].id])).rows[0].r;}
const issue=(db,rows,key=randomUUID())=>db.query('select public.payment_dispatch_create($1,$2::jsonb) as d',[key,JSON.stringify(rows)]).then(r=>r.rows[0].d);
async function supplierRow(db,amount=4000000){
 const p=(await db.query("insert into proveedores(nombre) values('Proveedor prueba') returning id")).rows[0];
 const r=(await db.query("insert into banco_creditek_pagos_proveedor(proveedor_id,monto,concepto,autorizado_at) values($1,$2,$3,'2026-10-06T02:00:00Z') returning id",[p.id,amount,'CTA CORRIENTE BANCO EJEMPLO 00123456789\nTitular comercial · NIT 900123456-1'])).rows[0];
 return (await db.query("select kora_private.payment_dispatch_snapshot('BP-'||$1::uuid) as r",[r.id])).rows[0].r;
}
async function funds(db){return (await db.query(`select jsonb_build_object(
 'bank',(select jsonb_agg(to_jsonb(c)) from banco_creditek_cuentas c),
 'requests',(select jsonb_agg(to_jsonb(s) order by id) from banco_creditek_pagos_proveedor s),
 'applications',(select jsonb_agg(to_jsonb(a)) from banco_creditek_aplicaciones_proveedor a)) as r`)).rows[0].r;}
const todayId='6aa755c1-b692-4d64-809a-b01d77221f75';
async function todayFixture(){
 const db=await fixture();
 await db.query(`insert into payment_dispatches(id,consecutive,request_id,created_by,created_at,issued_by_name)
  overriding system value values($1,6,$2,$3,'2026-10-05T21:39:23.896063Z','Maite')`,[todayId,randomUUID(),maite]);
 const old=[['234e52f4-e66f-42ee-a974-2c381d450897',434000],['8cfe7daa-68b1-4839-9117-6125af456acc',100000],
  ['af2e8bb6-3371-4ee8-a2b8-2f9ee1886462',1602800],['cdd2ee7c-16f5-4a1f-aeb0-012313bbdee1',25000],['f7818c42-3892-4939-bfce-0e86ea62537f',558000]];
 for(const [i,[id,valor]] of old.entries())await db.query('insert into payment_dispatch_items(dispatch_id,report_ref,snapshot,position) values($1,$2,$3,$4)',[todayId,'PO-'+id,JSON.stringify({id,valor,concept:'Conservar',bank_snapshot:{account_number:'0012345678'}}),i+1]);
 for(const [id,monto,nombre] of [['b58a0576-0357-44e1-a204-ce316063e48a',4000000,'MR MOVIL SAS'],['5d3cd96a-589b-4ce6-a969-cb2a4d3cba5d',1000000,'TEKMOBILE'],['18595c7d-0e6f-4288-958d-1b340db9a3cb',5000000,'MUNDO NET CEL']]){
  const v=(await db.query('insert into proveedores(nombre) values($1) returning id',[nombre])).rows[0];
  await db.query('insert into banco_creditek_pagos_proveedor(id,proveedor_id,monto,concepto) values($1,$2,$3,$4)',[id,v.id,monto,'Banco y cuenta autorizados 00123456789']);
 }
 return db;
}
async function doc(db){return (await db.query('select to_jsonb(d)||jsonb_build_object(\'items\',(select jsonb_agg(to_jsonb(i) order by position) from payment_dispatch_items i where dispatch_id=d.id)) as r from payment_dispatches d where id=$1',[todayId])).rows[0].r;}
test('OP-000006 se completa con 8 pagos y 12.719.800, preserva cinco filas, banco y autorizaciones; reintento no duplica',async()=>{
 const db=await todayFixture();try{
  const before=await doc(db),money=await funds(db),count=(await db.query('select count(*) n from payment_dispatches')).rows[0].n;
  await db.exec(completeToday);const after=await doc(db);
  assert.equal(after.id,before.id);assert.equal(after.consecutive,6);assert.equal(after.request_id,before.request_id);
  assert.equal(after.created_by,maite);assert.equal(after.issued_by_name,'Maite');assert.equal(after.created_at,before.created_at);
  assert.deepEqual(after.items.slice(0,5),before.items);assert.equal(after.items.length,8);
  assert.equal(after.items.reduce((n,i)=>n+Number(i.snapshot.valor),0),12719800);assert.equal(after.has_financial,true);
  assert.deepEqual(await funds(db),money);
  for(const i of after.items.slice(5)){const expected=(await db.query('select kora_private.payment_dispatch_snapshot($1) as r',[i.report_ref])).rows[0].r;
   const {dispatch_addition,...actual}=i.snapshot;assert.deepEqual(actual,expected);assert.equal(dispatch_addition.repair_key,'op-000006-proveedores-20261005');}
  await db.exec(completeToday);assert.deepEqual(await doc(db),after);assert.deepEqual(await funds(db),money);
  assert.equal((await db.query('select count(*) n from payment_dispatches')).rows[0].n,count);
  const audits=(await db.query("select usuario,detalle from audit_log where accion='orden_pago_ampliada'")).rows;
  assert.equal(audits.length,1);assert.equal(audits[0].usuario,null);assert.deepEqual(audits[0].detalle.original_items,before.items);
 }finally{await db.close();}
});
test('la ampliación aborta completa si la orden o un proveedor cambió o ya tiene otra orden',async()=>{
 const db=await todayFixture();try{
  const baseline=await doc(db),last='b58a0576-0357-44e1-a204-ce316063e48a';
  for(const [column,value] of [['monto',1],['estado','pagado'],['autorizado_por',null],['pagado_at','2026-10-06'],['soporte_path','proof.pdf']]){
   const old=(await db.query(`select ${column} v from banco_creditek_pagos_proveedor where id=$1`,[last])).rows[0].v;
   await db.query(`update banco_creditek_pagos_proveedor set ${column}=$1 where id=$2`,[value,last]);
   await assert.rejects(db.exec(completeToday),/Proveedor cambió/);assert.deepEqual(await doc(db),baseline);
   await db.query(`update banco_creditek_pagos_proveedor set ${column}=$1 where id=$2`,[old,last]);
  }
  await db.query('update payment_dispatches set note=$1 where id=$2',['Cambio simultáneo',todayId]);
  await assert.rejects(db.exec(completeToday),/orden cambió/);
  await db.query('update payment_dispatches set note=null where id=$1',[todayId]);
  const other=(await db.query('select id from payment_dispatches where id<>$1 limit 1',[todayId])).rows[0].id;
  await db.query('insert into payment_dispatch_items(dispatch_id,report_ref,snapshot,position) values($1,$2,$3,99)',[other,'BP-'+last,'{}']);
  await assert.rejects(db.exec(completeToday),/otra orden/);assert.deepEqual(await doc(db),baseline);
  assert.equal((await db.query("select count(*)::int n from audit_log where accion='orden_pago_ampliada'")).rows[0].n,0);
 }finally{await db.close();}
});
test('Maite emite tres proveedores por 10 millones sin mover banco, solicitudes ni facturas; no se repiten',async()=>{
 const db=await fixture();try{
  const rows=await Promise.all([supplierRow(db,4000000),supplierRow(db,1000000),supplierRow(db,5000000)]);
  await db.exec(`set request.jwt.claim.sub='${maite}'`);
  const before=await funds(db),key=randomUUID(),d=await issue(db,rows,key);
  assert.equal(d.has_financial,true);assert.equal(d.payment_dispatch_items.length,3);
  assert.equal(d.payment_dispatch_items.reduce((n,i)=>n+i.snapshot.valor,0),10000000);
  assert.equal(d.payment_dispatch_items[0].snapshot.report_date,'2026-10-05');
  assert.deepEqual(d.payment_dispatch_items[0].snapshot.bank_snapshot,{});
  assert.ok(d.payment_dispatch_items.every(i=>i.snapshot.destination_instructions===rows[0].destination_instructions));
  assert.deepEqual(await funds(db),before);
  assert.equal((await issue(db,rows,key)).id,d.id);
  await assert.rejects(issue(db,rows),/ya tiene una orden/);
  assert.deepEqual(await funds(db),before);
 }finally{await db.close();}
});
test('proveedores: bloquea alteraciones, pago cerrado y falta de autorización sin emitir parcialmente',async()=>{
 const db=await fixture();try{
  const row=await supplierRow(db);
  for(const patch of [{valor:999},{destination_instructions:'Otra cuenta bancaria 12345678'},
   {beneficiary_name:'Otra persona'},{beneficiary_identification:'99999'},
   {bank_snapshot:{bank:'Banco inventado',account_number:'99999999'}}]){
   await assert.rejects(issue(db,[{...row,...patch}]),/cambió/);
  }
  for(const [col,value] of [['estado','pendiente'],['estado','rechazado'],['estado','pagado'],
   ['autorizado_por',null],['autorizado_at',null],['pagado_por',actor],['pagado_at','2026-10-06'],['soporte_path','proof.pdf']]){
   const current=(await db.query(`select ${col} as v from banco_creditek_pagos_proveedor where id=$1`,[row.id])).rows[0].v;
   await db.query(`update banco_creditek_pagos_proveedor set ${col}=$1 where id=$2`,[value,row.id]);
   await assert.rejects(issue(db,[row]),/disponible/);
   await db.query(`update banco_creditek_pagos_proveedor set ${col}=$1 where id=$2`,[current,row.id]);
  }
  const other=await supplierRow(db,10);
  await db.query("update banco_creditek_pagos_proveedor set estado='pagado' where id=$1",[other.id]);
  await assert.rejects(issue(db,[row,other]),/disponible/);
  assert.equal((await db.query('select count(*)::int n from payment_dispatches')).rows[0].n,2);
 }finally{await db.close();}
});
test('proveedores: no permite actor de aliados, usuario inactivo, solicitud inexistente ni destino vacío',async()=>{
 const db=await fixture();try{
  const row=await supplierRow(db);
  await db.exec('create or replace function tiene_capacidad_aliados(text) returns boolean language sql as $$select true$$');
  await db.exec("set request.jwt.claim.sub='00000000-0000-4000-8000-000000000099'");
  await assert.rejects(issue(db,[row]),/Sin acceso/);
  await db.exec(`set request.jwt.claim.sub='${actor}';update perfiles set activo=false where id='${actor}'`);
  await assert.rejects(issue(db,[row]),/Sin acceso/);
  await db.exec(`update perfiles set activo=true where id='${actor}'`);
  await assert.rejects(issue(db,[{...row,report_ref:'BP-'+randomUUID()}]),/disponible/);
  await db.query("update banco_creditek_pagos_proveedor set concepto='' where id=$1",[row.id]);
  await assert.rejects(issue(db,[row]),/instrucciones/);
  const perms=(await db.query("select has_function_privilege('authenticated','kora_private.payment_dispatch_snapshot(text)','EXECUTE') e,has_table_privilege('authenticated','payment_dispatch_items','INSERT') w")).rows[0];
  assert.equal(perms.e,false);assert.equal(perms.w,false);
 }finally{await db.close();}
});
test('conserva las dos órdenes anteriores y 21 pagos; solo cuatro son giros confirmados sin soporte',async()=>{
 const db=await fixture();try{
 const r=(await db.query('select d.consecutive,d.original_reference,count(*)::int n,sum((i.snapshot->>\'valor\')::numeric) total,count(*) filter(where i.reported_paid)::int girados from payment_dispatches d join payment_dispatch_items i on i.dispatch_id=d.id group by d.id order by d.consecutive')).rows;
 assert.deepEqual(r.map(x=>x.n),[4,17]);assert.deepEqual(r.map(x=>x.total),['93200','10798752']);assert.deepEqual(r.map(x=>x.girados),[4,0]);assert.equal(r[1].original_reference,'OP-20260930-215711');
 assert.equal((await db.query("select count(*)::int n from treasury_movements where status='programado' and support_path is null")).rows[0].n,4);
 }finally{await db.close();}
});
test('emisión guarda consecutivo y snapshot; reintento devuelve la misma orden y otro request no repite el pago',async()=>{
 const db=await fixture();try{
 const row=await newRow(db),key=randomUUID(),d=await issue(db,[row],key);assert.equal(Number(d.consecutive),3);assert.equal(d.payment_dispatch_items.length,1);
 assert.equal((await issue(db,[row],key)).id,d.id);
 await assert.rejects(issue(db,[row]),/ya tiene una orden/);
 assert.equal((await db.query('select count(*)::int n from payment_dispatches')).rows[0].n,3);
 const other=await newRow(db);await assert.rejects(issue(db,[other],key),/otra orden/);
 const before=JSON.stringify(d.payment_dispatch_items[0].snapshot);await db.query("update financial_entries set beneficiary='Nombre corregido' where id=$1",[row.id]);
 assert.equal(JSON.stringify((await issue(db,[row],key)).payment_dispatch_items[0].snapshot),before);
 }finally{await db.close();}
});
test('rechaza datos alterados, pagos cerrados, duplicados y usuarios no autorizados sin guardar una orden parcial',async()=>{
 const db=await fixture();try{
 const row=await newRow(db);await assert.rejects(issue(db,[{...row,valor:999}]),/cambió/);
 await assert.rejects(issue(db,[row,row]),/duplicados/);
 await db.query("update financial_entries set status='pagado' where id=$1",[row.id]);await assert.rejects(issue(db,[row]),/disponible/);
 assert.equal((await db.query('select count(*)::int n from payment_dispatches')).rows[0].n,2);
 await db.exec("set request.jwt.claim.sub='00000000-0000-4000-8000-000000000099'");await assert.rejects(issue(db,[row]),/No autorizado/);
 const perms=(await db.query("select has_table_privilege('authenticated','payment_dispatch_items','INSERT') w,has_function_privilege('anon','public.payment_dispatch_create(uuid,jsonb)','EXECUTE') e")).rows[0];assert.equal(perms.w,false);assert.equal(perms.e,false);
 }finally{await db.close();}
});

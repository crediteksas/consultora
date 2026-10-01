import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const sql=readFileSync('supabase/migrations/20261001025844_payment_dispatch_registry.sql','utf8');
const actor='00000000-0000-4000-8000-000000000001';
async function fixture(){const db=await PGlite.create();await db.exec(`
 create role anon;create role authenticated;create schema auth;create schema kora_private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function es_controlador_financiero() returns boolean language sql as $$select auth.uid()='${actor}'::uuid$$;
 create function tiene_capacidad_aliados(text) returns boolean language sql as $$select auth.uid()='${actor}'::uuid$$;
 create table perfiles(id uuid primary key,nombre text);insert into perfiles values('${actor}','Gerencia');
 create table financial_entries(id uuid primary key default gen_random_uuid(),status text default 'aprobado',approved_by uuid default '${actor}',approved_at timestamptz default now(),paid_at timestamptz,support_path text,entry_type text default 'gasto',business_unit text default 'aliados',category text default 'nomina',due_date date default current_date,beneficiary text default 'Persona',beneficiary_document text default '12345678',destination_account text default 'Nequi · Ahorros · 3001234567',amount numeric,concept text default 'Nómina');
 create table treasury_movements(id uuid primary key default gen_random_uuid(),status text default 'programado',direction text default 'debit',authorized_by uuid default '${actor}',support_path text,paid_by uuid,unit text default 'tercerizacion',movement_date date default current_date,aliados_gasto_id uuid,beneficiary text,beneficiary_document text default '12345678',destination_account text default 'Nequi · Ahorros · 3001234567',amount numeric,concept text);
 create table aliados_gastos_operativos(id uuid primary key,plataforma text);
 create table liquidations(id uuid primary key default gen_random_uuid(),estado text default 'aprobada',frozen_at timestamptz default now(),approved_at timestamptz default now(),plataforma text default 'payjoy');
 create table payment_orders(id uuid primary key,estado text default 'programado',authorized_by uuid default '${actor}',authorized_at timestamptz default now(),historico_inicial boolean default false,recovery_review_required boolean default false,soporte_path text,fecha_pagada timestamptz,liquidation_id uuid,bank_snapshot jsonb default '{"bank":"Nequi","account_type":"ahorros","account_number":"3001234567","holder":"Persona","holder_identification":"12345678"}',valor numeric,concept text default 'Bono');
 create table payment_destination_corrections(item_id uuid,status text,item_kind text);
 create table audit_log(usuario uuid,accion text,tabla text,registro_id uuid,detalle jsonb);
 grant usage on schema auth,kora_private to authenticated;
 insert into treasury_movements(beneficiary,concept,amount,aliados_gasto_id) values
 ('Lujo red sas','Gasto Aliados — Bono alianza',20000,gen_random_uuid()),('María vasco','Gasto Aliados — Bono estrategia',20000,gen_random_uuid()),('Ingris Tatiana beltran','Gasto Aliados — Saldo pendiente',33200,gen_random_uuid()),('Ingrid Cristina ramos','Gasto Aliados — Bono estrategia',20000,gen_random_uuid());
 insert into liquidations default values;
 `);
 const values=[['d2a8',465000],['c722',10000],['fa05',912000],['f8ff',40000],['2ab8',392000],['8151',280600],['0abe',90000],['fa7b',1035895],['e06e',2359072],['0cea',601805],['baab',855680],['5431',270000],['5447',540000],['3fcd',1246700]];
 for(const [suffix,amount] of values)await db.query("insert into payment_orders(id,liquidation_id,valor) select $1,id,$2 from liquidations",['00000000-0000-4000-8000-00000000'+suffix,amount]);
 for(const [suffix,amount] of [['4918',550000],['725e',400000],['088c',750000]])await db.query('insert into financial_entries(id,amount) values($1,$2)',['00000000-0000-4000-8000-00000000'+suffix,amount]);
 await db.exec(sql);await db.exec(`set request.jwt.claim.sub='${actor}'`);return db;
}
async function newRow(db){const r=await db.query('insert into financial_entries(amount) values(500) returning id');return (await db.query("select kora_private.payment_dispatch_snapshot('FIN-'||$1::uuid) as r",[r.rows[0].id])).rows[0].r;}
const issue=(db,rows,key=randomUUID())=>db.query('select public.payment_dispatch_create($1,$2::jsonb) as d',[key,JSON.stringify(rows)]).then(r=>r.rows[0].d);
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

import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {canRemove}=require('../../creditek/erp/liquidaciones-importaciones.js');
const actor='00000000-0000-4000-8000-000000000001';
const migration=await readFile(new URL('../../supabase/migrations/20260907151838_liquidaciones_eliminar_importacion_sin_aprobar.sql',import.meta.url),'utf8');
const provisional=['liquidation_imported_files','liquidation_source_rows','liquidation_calculations','liquidation_incidents','krediya_diferencias'];
const financial=['liquidation_treasury_destinations','retail_b2b_compensations','cobros_expected','aliados_gastos_operativos','liquidation_adjustments'];
let db;
before(async()=>{
  db=await PGlite.create();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function tiene_capacidad_aliados(text) returns boolean language sql as $$select coalesce(current_setting('test.allowed',true),'true')='true'$$;
    create table liquidations(id uuid primary key default gen_random_uuid(),plataforma text default 'alo',estado text default 'importada',fecha_corte date default '2026-09-06',approved_at timestamptz,approved_by uuid,frozen_at timestamptz);
    create table liquidation_operations(id uuid primary key default gen_random_uuid(),liquidation_id uuid references liquidations);
    create table liquidation_bonuses(id uuid primary key default gen_random_uuid(),liquidation_id uuid references liquidations,operation_id uuid references liquidation_operations);
    create table liquidation_approvals(id uuid primary key default gen_random_uuid(),liquidation_id uuid references liquidations,etapa text,decision text);
    create table payment_orders(id uuid primary key default gen_random_uuid(),liquidation_id uuid references liquidations,estado text default 'pendiente',authorized_at timestamptz,authorized_by uuid,fecha_pagada timestamptz,paid_by uuid,soporte_path text);
    create table payment_items(id uuid primary key default gen_random_uuid(),payment_order_id uuid references payment_orders,operation_id uuid references liquidation_operations,bonus_id uuid references liquidation_bonuses);
    create table treasury_movements(id uuid primary key default gen_random_uuid(),liquidation_id uuid references liquidations,payment_order_id uuid references payment_orders);
    create table creditos_historicos_plataforma(id uuid primary key default gen_random_uuid(),datos_origen jsonb);
    create table krediya_instrucciones(id uuid primary key default gen_random_uuid(),liquidation_id uuid references liquidations);
    create table audit_log(id bigint generated always as identity,usuario text,accion text,tabla text,registro_id text,detalle jsonb);
    create schema storage;create table storage.objects(name text);
    insert into storage.objects values('aliados/originales/original.xlsx');
    select set_config('request.jwt.claim.sub','${actor}',false);
    ${[...provisional,...financial].map(t=>`create table ${t}(id uuid primary key default gen_random_uuid(),liquidation_id uuid references liquidations);`).join('\n')}
    alter table liquidation_imported_files add column sha256 text unique;
    alter table liquidation_imported_files add column storage_path text;
    alter table liquidation_source_rows add column file_id uuid references liquidation_imported_files;
    alter table liquidation_calculations add column operation_id uuid references liquidation_operations;`);
  await db.exec(migration);
});
after(()=>db?.close());
async function batch(state='importada'){
  return (await db.query('insert into liquidations(estado) values($1) returning id',[state])).rows[0].id;
}
const remove=(id,reason='Archivo incorrecto de ALO')=>db.query('select aliados_eliminar_importacion($1,$2) r',[id,reason]);
const exists=async id=>(await db.query('select count(*)::int n from liquidations where id=$1',[id])).rows[0].n===1;
test('Gestión retira lote calculado con respaldo; original, otros lotes y auditoría permanecen',async()=>{
  const id=await batch('calculada'),other=await batch();
  const op=(await db.query('insert into liquidation_operations(liquidation_id) values($1) returning id',[id])).rows[0].id;
  const file=(await db.query("insert into liquidation_imported_files(liquidation_id,sha256,storage_path) values($1,'hash-alo','aliados/originales/original.xlsx') returning id",[id])).rows[0].id;
  await db.query('insert into liquidation_source_rows(liquidation_id,file_id) values($1,$2)',[id,file]);
  await db.query('insert into liquidation_calculations(liquidation_id,operation_id) values($1,$2)',[id,op]);
  const bonus=(await db.query('insert into liquidation_bonuses(liquidation_id,operation_id) values($1,$2) returning id',[id,op])).rows[0].id;
  const order=(await db.query('insert into payment_orders(liquidation_id) values($1) returning id',[id])).rows[0].id;
  await db.query('insert into payment_items(payment_order_id,operation_id,bonus_id) values($1,$2,$3)',[order,op,bonus]);
  await db.query("insert into liquidation_approvals(liquidation_id,etapa,decision) values($1,'revision','aprobada')",[id]);
  const result=(await remove(id)).rows[0].r;assert.equal(result.retirada,true);
  assert.equal(await exists(id),false);assert.equal(await exists(other),true);
  const backup=(await db.query('select * from kora_private.liquidaciones_retiradas where liquidation_id=$1',[id])).rows[0];
  assert.equal(backup.retirado_por,actor);assert.equal(backup.snapshot.payment_items.length,1);
  assert.equal(backup.snapshot.liquidation_source_rows[0].file_id,file);
  assert.equal(backup.snapshot.payment_orders[0].estado,'pendiente');
  assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n,1);
  await db.query("insert into liquidation_imported_files(liquidation_id,sha256) values($1,'hash-alo')",[other]);
  assert.equal((await remove(id)).rows[0].r.ya_retirada,true);
  assert.equal((await db.query('select count(*)::int n from audit_log where registro_id=$1',[id])).rows[0].n,1);
});
for(const state of ['importada','validada','con_novedades','calculada','revisada'])test(`permite retirar ${state} sin aprobación`,async()=>{
  const id=await batch(state);assert.equal(canRemove({estado:state}),true);await remove(id);assert.equal(await exists(id),false);
});
for(const state of ['aprobada','programada','pagada','conciliada','cerrada','anulada'])test(`protege ${state} aunque falte frozen_at`,async()=>{
  const id=await batch(state);assert.equal(canRemove({estado:state}),false);await assert.rejects(()=>remove(id),/aprobado o pasó a pagos/);assert.equal(await exists(id),true);
});
test('rechaza campos de aprobación y registro de decisión aunque estado esté atrasado',async()=>{
  for(const col of ['approved_at','approved_by','frozen_at']){
    const id=await batch();await db.query(`update liquidations set ${col}=$2 where id=$1`,[id,col.endsWith('_by')?actor:'2026-09-07']);
    assert.equal(canRemove({estado:'importada',[col]:'valor'}),false);
    await assert.rejects(()=>remove(id),/aprobado o pasó a pagos/);
  }
  const id=await batch();await db.query("insert into liquidation_approvals(liquidation_id,etapa,decision) values($1,'aprobacion','aprobada')",[id]);
  await assert.rejects(()=>remove(id),/aprobado o pasó a pagos/);
});
test('protege órdenes con autorización, soporte, programación o pago sin cerrar el lote',async()=>{
  for(const [col,value] of [['estado','programado'],['estado','pagado'],['authorized_by',actor],['authorized_at','2026-09-07'],['paid_by',actor],['fecha_pagada','2026-09-07'],['soporte_path','soporte.pdf']]){
    const id=await batch();await db.query(`insert into payment_orders(liquidation_id,${col}) values($1,$2)`,[id,value]);
    await assert.rejects(()=>remove(id),/órdenes autorizadas/);assert.equal(await exists(id),true);
  }
});
for(const table of [...financial,'treasury_movements'])test(`no borra ni modifica ${table}`,async()=>{
  const id=await batch();await db.query(`insert into ${table}(liquidation_id) values($1)`,[id]);
  const before=(await db.query(`select * from ${table}`)).rows;
  await assert.rejects(()=>remove(id),/movimientos financieros/);
  assert.deepEqual((await db.query(`select * from ${table}`)).rows,before);
});
test('preserva créditos sincronizados y gestiones previas; explica por qué requiere revisión',async()=>{
  const id=await batch();await db.query('insert into creditos_historicos_plataforma(datos_origen) values($1)',[{liquidacion_origen_id:id}]);
  await assert.rejects(()=>remove(id),/créditos o gestiones vinculadas/);
  const id2=await batch();await db.query('insert into krediya_instrucciones(liquidation_id) values($1)',[id2]);
  await assert.rejects(()=>remove(id2),/créditos o gestiones vinculadas/);
});
test('una referencia externa desconocida aborta todo, incluido respaldo y auditoría',async()=>{
  const id=await batch();await db.exec('create table dependencia_futura(liquidation_id uuid references liquidations)');
  await db.query('insert into dependencia_futura values($1)',[id]);
  await assert.rejects(()=>remove(id),/registros relacionados/);
  assert.equal(await exists(id),true);
  assert.equal((await db.query('select count(*)::int n from kora_private.liquidaciones_retiradas where liquidation_id=$1',[id])).rows[0].n,0);
});
test('exige sesión, rol revisor y motivo; respaldo inaccesible a clientes',async()=>{
  const id=await batch();
  for(const reason of ['',null,'abcd','x'.repeat(1001)])await assert.rejects(()=>remove(id,reason),/motivo/);
  await db.exec("select set_config('test.allowed','false',false)");
  await assert.rejects(()=>remove(id),/No autorizado/);
  await db.exec("select set_config('test.allowed','true',false);select set_config('request.jwt.claim.sub','',false)");
  await assert.rejects(()=>remove(id),/No autorizado/);
  await db.exec(`select set_config('request.jwt.claim.sub','${actor}',false);set role authenticated;`);
  await assert.rejects(()=>db.query('select * from kora_private.liquidaciones_retiradas'),/permission denied/);
  // Mismo rol de acceso que usa Mayte; autorización de negocio dentro del RPC.
  await remove(id);
  await db.exec('reset role;set role anon;');
  await assert.rejects(()=>remove(id),/permission denied/);
  await db.exec('reset role');
});

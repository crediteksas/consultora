import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url),Commerce=require('../../creditek/erp/liquidaciones-comercios.js');
const migration=await readFile(new URL('../../supabase/migrations/20260907155104_liquidaciones_vincular_comercio.sql',import.meta.url),'utf8');
const unified=await readFile(new URL('../../supabase/migrations/20260906205155_clientes_unificados_y_pagos_seguros.sql',import.meta.url),'utf8');
const actor='00000000-0000-4000-8000-000000000001';
let db,old,closed,seq=0;
before(async()=>{
  db=await PGlite.create();
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function tiene_capacidad_aliados(text) returns boolean language sql as $$select coalesce(current_setting('test.allowed',true),'true')='true'$$;
    create table liquidations(id uuid primary key default gen_random_uuid(),plataforma text default 'alo',estado text default 'con_novedades',approved_at timestamptz,approved_by uuid,frozen_at timestamptz);
    create table ejecutivos(id uuid primary key,nombre text,activo boolean default true);
    insert into ejecutivos values('${actor}','Ejecutivo de prueba',true);
    create table origenes(codigo text primary key,nombre text not null,tipo text not null,ciudad text,ejecutivo_id uuid,activo boolean default true,aliases jsonb default '[]');
    insert into origenes values('CK-11','Creditel Coveñas','propia','Coveñas',null,true,'["Creditel Covenas"]');
    create table liquidation_operations(id uuid primary key default gen_random_uuid(),liquidation_id uuid references liquidations,establishment_name text,origen_codigo text,tipo_establecimiento text default 'no_reconocido',ejecutivo_id uuid,normalized_data jsonb default '{"incidencias":["comercio_no_reconocido","otra_novedad"],"movimientos":[{"original":"no cambiar"}],"montoCredito":1000}',monto_credito numeric default 1000,inicial numeric default 100);
    create table liquidation_incidents(id uuid primary key default gen_random_uuid(),liquidation_id uuid references liquidations,operation_id uuid references liquidation_operations,tipo text default 'comercio_no_reconocido',estado text default 'abierta',resolution text,resolved_by uuid,resolved_at timestamptz);
    create table liquidation_approvals(liquidation_id uuid,etapa text,decision text);
    create table liquidation_calculations(liquidation_id uuid);
    create table payment_orders(liquidation_id uuid);
    create table aliados(id uuid primary key default gen_random_uuid(),nombre_comercial text,ciudad_principal text,ejecutivo_id uuid,estado_asociacion text);
    create table aliados_sedes(aliado_id uuid,origen_codigo text unique,nombre text,ciudad text,estado_asociacion text,updated_at timestamptz);
    create table audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
    select set_config('request.jwt.claim.sub','${actor}',false);`);
  await db.exec(unified.slice(unified.indexOf('create or replace function public.vincular_ficha_nuevo_comercio()'),unified.indexOf('create or replace function public.tesoreria_guardar_ficha_cliente(')));
  old=await operation('FULL ACCESORIOS LA 72');closed=await operation('Otro histórico','pagada');
  await db.query("update liquidation_incidents set estado='resuelta',resolution='es un nuevo aliado',resolved_by=$1,resolved_at=now()",[actor]);
  await db.exec(migration);
});
after(()=>db?.close());
async function operation(name='Nuevo local '+(++seq),state='con_novedades'){
  const lot=(await db.query('insert into liquidations(estado) values($1) returning id',[state])).rows[0].id;
  const op=(await db.query('insert into liquidation_operations(liquidation_id,establishment_name) values($1,$2) returning id',[lot,name])).rows[0].id;
  await db.query('insert into liquidation_incidents(liquidation_id,operation_id) values($1,$2)',[lot,op]);return {lot,op};
}
const link=(o,code=null,data=null)=>db.query('select aliados_vincular_comercio($1,$2,$3) result',[o.op,code,data]);
const newData=name=>({nombre:name,ciudad:'Sincelejo',ejecutivo_id:actor});
test('reabre la falsa resolución con auditoría; preserva el histórico',async()=>{
  assert.equal((await db.query('select estado from liquidation_incidents where operation_id=$1',[old.op])).rows[0].estado,'abierta');
  assert.equal((await db.query('select estado from liquidation_incidents where operation_id=$1',[closed.op])).rows[0].estado,'resuelta');
  const a=(await db.query("select detalle from audit_log where accion='comercio_resolucion_sin_vinculo_reabierta'")).rows;
  assert.equal(a.length,1);assert.equal(a[0].detalle.antes.resolution,'es un nuevo aliado');assert.equal(a[0].detalle.antes.resolved_by,actor);
});
test('justificar o ignorar no oculta un comercio sin vínculo',async()=>{
  for(const estado of ['resuelta','ignorada'])await assert.rejects(()=>db.query('update liquidation_incidents set estado=$2 where operation_id=$1',[old.op,estado]),/Primero vincula/);
});
test('vincula tienda propia y recuerda alias; no inventa cliente ni cuenta',async()=>{
  const o=await operation('CREDITEK COVEÑAS');
  const r=(await link(o,'CK-11')).rows[0].result;assert.equal(r.tipo,'propia');assert.equal(r.creado,false);
  const row=(await db.query('select * from liquidation_operations where id=$1',[o.op])).rows[0];
  assert.equal(row.origen_codigo,'CK-11');assert.equal(row.tipo_establecimiento,'propia');assert.equal(row.monto_credito,'1000');assert.equal(row.inicial,'100');
  assert.deepEqual(row.normalized_data.movimientos,[{original:'no cambiar'}]);assert.deepEqual(row.normalized_data.incidencias,['otra_novedad']);
  assert.ok((await db.query("select aliases from origenes where codigo='CK-11'")).rows[0].aliases.includes('CREDITEK COVEÑAS'));
  assert.equal((await db.query('select count(*)::int n from aliados')).rows[0].n,0);
  assert.equal((await link(o,'CK-11')).rows[0].result.ya_vinculado,true);
  await assert.rejects(()=>link(o,null,newData('otro')),/ya tiene un comercio/);
});
test('nuevo aliado aparece en ficha única y sede, preservando importes y original',async()=>{
  const r=(await link(old,null,newData('FULL ACCESORIOS LA 72'))).rows[0].result;
  const row=(await db.query('select * from liquidation_operations where id=$1',[old.op])).rows[0];
  assert.equal(row.tipo_establecimiento,'aliado');assert.equal(row.ejecutivo_id,actor);assert.equal(row.monto_credito,'1000');
  assert.equal((await db.query('select count(*)::int n from aliados_sedes where origen_codigo=$1',[r.origen_codigo])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from payment_orders')).rows[0].n,0);
  assert.equal((await db.query('select estado from liquidations where id=$1',[old.lot])).rows[0].estado,'con_novedades');
  await assert.rejects(()=>link({op:closed.op},r.origen_codigo),/antes de calcular/);
});
test('no duplica comercios por acento, nombre o alias, ni reasigna alias ajeno',async()=>{
  await assert.rejects(()=>operation('NUEVO COVEÑAS').then(o=>link(o,null,newData('CREDITEL COVENAS'))),/ya figura/);
  const o=await operation('FULL ACCESORIOS LA 72');await assert.rejects(()=>link(o,'CK-11'),/también pertenece/);
  await assert.rejects(()=>link(o,null,newData('FULL ACCESORIOS LA 72')),/ya figura/);
});
test('requiere datos reales; rollback conserva la alerta y no crea ficha',async()=>{
  const o=await operation('Lachescel soluciones');
  for(const data of [{nombre:'Lachescel soluciones'}, {...newData('Lachescel soluciones'),ejecutivo_id:null},{...newData('Lachescel soluciones'),tipo:'propia'}])
    await assert.rejects(()=>link(o,null,data),/nombre y la ciudad|ejecutivo|inválidos/);
  assert.equal((await db.query('select origen_codigo from liquidation_operations where id=$1',[o.op])).rows[0].origen_codigo,null);
  assert.equal((await db.query('select estado from liquidation_incidents where operation_id=$1',[o.op])).rows[0].estado,'abierta');
  await assert.rejects(()=>link(o,'CK-11',newData('Lachescel soluciones')),/no ambos/);
  await assert.rejects(()=>link(o),/no ambos/);
});
for(const state of ['calculada','revisada','aprobada','programada','pagada','conciliada','cerrada','anulada'])test('protege lote '+state,async()=>{
  const o=await operation(undefined,state);await assert.rejects(()=>link(o,'CK-11'),/antes de calcular/);
});
test('protege cálculo, orden y aprobación aunque el estado esté atrasado',async()=>{
  for(const table of ['payment_orders','liquidation_calculations','liquidation_approvals']){
    const o=await operation();await db.query(`insert into ${table}(liquidation_id${table==='liquidation_approvals'?',etapa,decision':''}) values($1${table==='liquidation_approvals'?",'aprobacion','aprobada'":''})`,[o.lot]);
    await assert.rejects(()=>link(o,'CK-11'),/antes de calcular/);
  }
});
test('solo sesión revisora, no acceso anónimo; wrapper invoker',async()=>{
  const o=await operation();await db.exec("select set_config('test.allowed','false',false)");await assert.rejects(()=>link(o,'CK-11'),/No autorizado/);
  await db.exec("select set_config('test.allowed','true',false);select set_config('request.jwt.claim.sub','',false)");await assert.rejects(()=>link(o,'CK-11'),/No autorizado/);
  await db.exec(`select set_config('request.jwt.claim.sub','${actor}',false);set role anon;`);await assert.rejects(()=>link(o,'CK-11'),/permission denied/);
  await db.exec('reset role;set role authenticated');await link(o,'CK-11');await db.exec('reset role');
  assert.equal((await db.query("select prosecdef from pg_proc where proname='aliados_vincular_comercio'")).rows[0].prosecdef,false);
});
test('el contador muestra los tres comercios aunque alguien haya cerrado una alerta',()=>{
  const operations=['full','coveñas','lachescel'].map(id=>({id,origen_codigo:null,tipo_establecimiento:'no_reconocido'}));
  const incidents=operations.map((o,index)=>({id:String(index),operation_id:o.id,tipo:'comercio_no_reconocido',estado:index?'abierta':'resuelta'}));
  assert.equal(Commerce.pending(incidents,operations).length,3);
  operations[0].origen_codigo='alias';operations[0].tipo_establecimiento='aliado';assert.equal(Commerce.pending(incidents,operations).length,2);
});

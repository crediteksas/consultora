import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';

const sql=readFileSync('supabase/migrations/20261006223924_aliados_gastos_historicos_pagados.sql','utf8');
const app=readFileSync('creditek/erp/aliados-v1-1-app.js','utf8');
const actor='00000000-0000-0000-0000-000000000001';
const rpc='select id,valor,estado,aprobado_at,fecha_causacion_historica,treasury_movement_id from public.aliados_registrar_gasto_historico_pagado($1::date,$2,$3,$4::numeric,$5,$6)';
const params=['2026-09-06','krediya','Viáticos y eventos',450000,
 'Autorizado por Gerencia: gasto ya pagado de septiembre, distribución semanal contable.',
 'prueba:viaticos:2026-09:semana-1'];

async function fixture(){
 const db=await PGlite.create();
 await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create schema kora_private;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table perfiles(id uuid primary key,activo boolean,rol text);
  create table aliados_operadores(perfil_id uuid primary key,activo boolean,capacidad text);
  insert into perfiles values('${actor}',true,'gerencia');
  insert into aliados_operadores values('${actor}',true,'aprobador');
  create function public.es_controlador_financiero() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.perfiles where id=auth.uid() and activo)$$;
  create table aliados_gastos_operativos(
   id uuid primary key default gen_random_uuid(),fecha date not null,plataforma text,
   concepto text not null,descripcion text,valor numeric(16,2) not null check(valor>0),
   estado text not null,registrado_por uuid not null,aprobado_por uuid,aprobado_at timestamptz,
   created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
   treasury_movement_id uuid);
  alter table aliados_gastos_operativos enable row level security;
  create policy historical_read on aliados_gastos_operativos for select to authenticated using(true);
  create table audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
  create table treasury_movements(id int primary key,amount numeric,status text);
  create table banco_cuentas(id int primary key,saldo numeric);
  create table caja_movimientos(id int primary key,valor numeric);
  create table utilidades_cierres_negocio(id int primary key,utilidad_neta numeric,retiro_declarado numeric);
  insert into treasury_movements values(1,500,'pendiente');
  insert into banco_cuentas values(1,16729605);
  insert into caja_movimientos values(1,100);
  insert into utilidades_cierres_negocio values(1,33026532.09,33026532.09);
  grant usage on schema public,auth,kora_private to authenticated;
  grant select on aliados_gastos_operativos to authenticated;
 `);
 await db.exec(sql);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
 await db.exec('set role authenticated');
 return db;
}

test('registrar cuatro semanas ya pagadas conserva autorización real, sin giros ni duplicados',async()=>{
 const db=await fixture();
 try{
  for(const [i,n] of [6,13,20,27].entries()){
   const args=[...params];args[0]=`2026-09-${String(n).padStart(2,'0')}`;args[5]=`prueba:viaticos:2026-09:semana-${i+1}`;
   const row=(await db.query(rpc,args)).rows[0];
   assert.equal(row.estado,'aprobado');assert.equal(Number(row.valor),450000);
   assert.equal(row.treasury_movement_id,null);
   assert.ok(new Date(row.aprobado_at)>new Date('2026-10-01'));
   assert.equal((await db.query(rpc,args)).rows[0].id,row.id);
  }
  await db.exec('reset role');
  const totals=(await db.query('select count(*)::int n,sum(valor)::text total from aliados_gastos_operativos')).rows[0];
  assert.deepEqual(totals,{n:4,total:'1800000.00'});
  assert.equal((await db.query('select count(*)::int n from audit_log')).rows[0].n,4);
  const audit=(await db.query('select detalle from audit_log limit 1')).rows[0].detalle;
  assert.equal(audit.nuevo_pago,false);assert.equal(audit.ya_pagado_declarado,true);
  assert.deepEqual((await db.query('select * from treasury_movements')).rows,[{id:1,amount:'500',status:'pendiente'}]);
  assert.deepEqual((await db.query('select * from banco_cuentas')).rows,[{id:1,saldo:'16729605'}]);
  assert.deepEqual((await db.query('select * from caja_movimientos')).rows,[{id:1,valor:'100'}]);
  assert.deepEqual((await db.query('select * from utilidades_cierres_negocio')).rows,[{id:1,utilidad_neta:'33026532.09',retiro_declarado:'33026532.09'}]);
 }finally{await db.close();}
});

test('bloquea permisos insuficientes, importes inválidos, futuro y reintentos con datos diferentes',async()=>{
 const db=await fixture();
 try{
  await db.query(rpc,params);
  await assert.rejects(db.query(rpc,[...params.slice(0,3),450001,...params.slice(4)]),/datos diferentes/);
  for(const amount of [0,-1,'NaN','Infinity',450000.001]){
   const args=[...params];args[3]=amount;
   await assert.rejects(db.query(rpc,args),/Importe histórico no válido/);
  }
  const future=[...params];future[0]='2999-01-01';
  await assert.rejects(db.query(rpc,future),/fecha contable/);
  const platform=[...params];platform[1]='addi';
  await assert.rejects(db.query(rpc,platform),/Plataforma/);
  const motive=[...params];motive[4]='';
  await assert.rejects(db.query(rpc,motive),/Faltan/);
  await assert.rejects(db.exec('insert into aliados_gastos_operativos(fecha,concepto,valor,estado,registrado_por) values(current_date,\'no autorizado\',1,\'aprobado\',auth.uid())'),/permission denied/);
  await db.exec('reset role');
  await db.exec(`update perfiles set rol='auditoria' where id='${actor}';set role authenticated`);
  await assert.rejects(db.query(rpc,params),/Solo Gerencia activa/);
  await db.exec('reset role');
  await db.exec(`update perfiles set rol='gerencia',activo=false where id='${actor}';set role authenticated`);
  await assert.rejects(db.query(rpc,params),/Solo Gerencia activa/);
  await db.exec('reset role');
  await db.exec(`update perfiles set activo=true where id='${actor}';update aliados_operadores set capacidad='revisor';set role authenticated`);
  await assert.rejects(db.query(rpc,params),/Solo Gerencia activa/);
  await db.exec('reset role;set role anon');
  await assert.rejects(db.query(rpc,params),/permission denied/);
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.exec('set role authenticated');
  await assert.rejects(db.query(rpc,params),/Solo Gerencia activa/);
 }finally{await db.close();}
});

test('Dashboard Krediya resta septiembre y no octubre; otros gastos siguen por autorización',()=>{
 const ctx={db:{financialExpenses:[],expenses:[
  ...[6,13,20,27].map((n,i)=>({id:`h${i}`,plataforma:'krediya',valor:450000,estado:'aprobado',
   fecha_causacion_historica:`2026-09-${String(n).padStart(2,'0')}`,aprobado_at:'2026-10-06T22:00:00Z'})),
  {id:'normal',plataforma:'krediya',valor:50,fecha:'2026-09-06',estado:'aprobado',aprobado_at:'2026-10-06T22:00:00Z'}
 ]},approvalDay:v=>v?.slice(0,10)||'',date:v=>v?.slice(0,10)||'',originFor:()=>null,OPERATION_CUTOFF:'2026-09-02'};
 const code=app.slice(app.indexOf('  function dashboardExpenses('),app.indexOf('  function renderDashboard('));
 vm.runInNewContext(code,ctx);
 const sept=ctx.dashboardExpenses({from:'2026-09-01',to:'2026-09-30',platform:'krediya'});
 assert.equal(sept.rows.length,4);assert.equal(sept.rows.reduce((n,x)=>n+Number(x.valor),0),1800000);
 assert.equal(ctx.dashboardExpenses({from:'2026-10-01',to:'2026-10-31',platform:'krediya'}).rows.length,1);
 assert.equal(ctx.dashboardExpenses({from:'2026-09-01',to:'2026-09-30',platform:'alo'}).rows.length,0);
 assert.match(app,/Ya pagado · sin nuevo giro/);
});

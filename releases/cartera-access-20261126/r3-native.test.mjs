import test from'node:test';import assert from'node:assert/strict';
import{setup,read,value,asActor,enableFictional,operator}from'./core-fixture.mjs';
import{fullSetup,operation,other,quote}from'./full-fixture.mjs';
import{denied}from'./assert-rpc.mjs';
import{checkCarteraCoverage}from'./candidate/cartera-coverage-gate.mjs';
import{mkdtempSync,mkdirSync,copyFileSync,rmSync}from'node:fs';
import{tmpdir}from'node:os';import{join}from'node:path';import{pathToFileURL}from'node:url';
test('activation uses reviewed install seal and rechecks coverage instead of accepting drift',async()=>{
 const db=await setup();try{
  const seal=await value(db,'select fingerprint from kora_private.cartera_contract');
  await assert.rejects(db.query('select kora_private.cartera_activate($1)',['b'.repeat(64)]),/cartera_activation_catalog_unreviewed/);
  await db.exec('create table public.future_cartera_module(id int);alter table public.future_cartera_module enable row level security;');
  await assert.rejects(db.query('select kora_private.cartera_assert_coverage()'),/cartera_deny_coverage_incomplete/);
  await assert.rejects(enableFictional(db),/cartera_relation_inventory_changed/);
  assert.equal(await value(db,'select fingerprint from kora_private.cartera_contract'),seal);assert.equal(await value(db,'select enabled from kora_private.cartera_contract'),false);
  await db.exec('begin;create table public.future_in_transaction(id int);');
  await assert.rejects(db.query('select kora_private.cartera_assert_coverage()'),/cartera_deny_coverage_incomplete/);await db.exec('rollback');
  assert.equal(await value(db,"select to_regclass('public.future_in_transaction')"),null);
 }finally{await db.close();}
});
test('changed policy expression or RLS prevents activation even with a matching freshly computed parameter',async()=>{
 for(const change of["alter policy cartera_dedicated_deny on public.clientes using(true)","alter table storage.objects disable row level security"]){
  const db=await setup();try{
   await db.exec(change);await assert.rejects(db.query('select kora_private.cartera_assert_coverage()'),/cartera_deny_coverage_incomplete/);
   const fresh=await value(db,'select kora_private.cartera_catalog_fingerprint()');await assert.rejects(db.query('select kora_private.cartera_activate($1)',[fresh]),/cartera_(deny_coverage_incomplete|managed_rls_disabled)/);
  }finally{await db.close();}
 }
});
test('full trust pins reject changed dependencies and the native PUBLIC alias works for anon and backend callers',async()=>{
 let {db}=await fullSetup({install:false});try{
  await db.exec("create or replace function public.tiene_capacidad_aliados(p_capacidad text default 'revisor') returns boolean language sql stable security definer set search_path='public','pg_temp' as $$select true$$;");
  await assert.rejects(db.exec(read('candidate/scope-full.sql')),/cartera_trusted_dependency_changed/);await db.exec('rollback');
  assert.equal(await value(db,"select to_regprocedure('public.cartera_subject()')"),null);
 }finally{await db.close();}
 ({db}=await fullSetup({install:false}));try{
  const shared=["select public.tiene_capacidad_cartera('read')",'select public.cobra_quality_operator()'];
  const result=async sql=>{try{return{data:await value(db,sql)}}catch(e){return{error:e.code,message:e.message}}};
  const before={};for(const role of['anon','service_role']){await asActor(db,'',role);before[role]=[];for(const sql of shared)before[role].push(await result(sql));}
  await db.exec('set session authorization postgres;reset role;');await db.exec(read('candidate/scope-full.sql'));
  for(const role of['anon','service_role']){
   await asActor(db,'',role);assert.equal(await value(db,'select public.cartera_subject()'),null);
   const after=[];for(const sql of shared)after.push(await result(sql));assert.deepEqual(after,before[role]);
  }
  await db.exec('set session authorization postgres;create role fictional_backend;grant usage on schema public to fictional_backend;');await asActor(db,'','fictional_backend');assert.equal(await value(db,'select public.cartera_subject()'),null);
 }finally{await db.close();}
});
test('mandatory catalog gate rejects omitted relations, changed denies and later publications',async()=>{
 const db=await setup();try{
  const snapshot=await value(db,read('candidate/catalog-query.sql'));assert.deepEqual(checkCarteraCoverage(snapshot),[]);
  // Execute the integrated checker from the SAME target directory layout used
  // by the official pipeline, not just its coverage helper.
  const temp=mkdtempSync(join(tmpdir(),'cartera-gate-'));const target=join(temp,'scripts/supabase-compat');mkdirSync(target,{recursive:true});
  try{
   for(const f of['check-permission-contract.mjs','cartera-coverage-gate.mjs','cartera-managed-inventory.mjs'])copyFileSync(new URL('./candidate/'+f,import.meta.url),join(target,f));
   const{checkPermissionContract}=await import(pathToFileURL(join(target,'check-permission-contract.mjs')).href);
   const run=after=>checkPermissionContract({before:snapshot,after,contract:{schema_version:1,project:'fixture',objects:[]},created:[]});
   assert.equal(run(snapshot).ok,true);
   for(const [mutate,expectedError] of[[c=>c.tables.pop(),/Cartera relation omitted/],[c=>{c.tables[0].policy.roles=['PUBLIC'];},/Cartera restrictive deny missing or changed/],[c=>c.publications.push({publication:'fictional',schema:'public',table:'clientes'}),/Cartera publication changes require/]]){
    const altered=structuredClone(snapshot);mutate(altered.cartera_coverage);const r=run(altered);assert.equal(r.ok,false);assert.match(r.errors.join(','),expectedError);
   }
  }finally{rmSync(temp,{recursive:true});}
  const missing=structuredClone(snapshot);missing.cartera_coverage.tables.pop();assert.match(checkCarteraCoverage(missing).join(','),/omitted/);
  const changed=structuredClone(snapshot);changed.cartera_coverage.tables[0].policy.roles=['PUBLIC'];assert.match(checkCarteraCoverage(changed).join(','),/deny missing or changed/);
  const pub=structuredClone(snapshot);pub.cartera_coverage.publications.push({publication:'fictional',schema:'public',table:'clientes'});assert.match(checkCarteraCoverage(pub).join(','),/publication changes/);
  await db.exec('create table public.future_gate_module(id int);alter table public.future_gate_module enable row level security;');
  assert.match(checkCarteraCoverage(await value(db,read('candidate/catalog-query.sql'))).join(','),/future_gate_module/);
 }finally{await db.close();}
});
test('classic origin scope coexists with consistent Aliados-wide KrediYA management for two origins',async()=>{
 const{db,cut}=await fullSetup({bothOrigins:true});try{
  await enableFictional(db);await asActor(db);
  const data=(name,args='')=>value(db,`select public.cartera_operador_datos(${quote(name)}${args})`);
  assert.equal((await data('portfolio')).length,1);
  const c=await data('cut',`,null,'${cut.id}'`);assert.equal(c.row_count,2);assert.deepEqual(c.observations.map(o=>o.operation_id).sort(),[operation,other]);
  assert.equal((await data('cuts',",'2026-10-01'"))[0].row_count,2);
  for(const [i,op]of[operation,other].entries()){
   const id='66666666-6666-4666-8666-66666666666'+i;
   assert.equal((await data('customer_history',`,null,'${op}'`)).operation_id,op);
   assert.equal((await value(db,`select public.cartera_operador_guardar_gestion('${id}','${op}','note','internal','Fictional cross-origin permitted management')`)).payment_created,false);
   assert.equal((await data('collection_history',`,null,'${op}'`)).length,1);
   // Existing two-domain behavior: B is a cut-linked quality event, not a
   // classic-origin read. It intentionally has no classic obligation link.
   assert.equal((await data('collection_history',`,null,'${op}'`))[0].obligation_id,op===operation?'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1':null);
   const payload={kind:'request',parent_id:null,cut_id:cut.id,operation_id:op,amount_cents:6000,allocations:[],purpose:'installments',note:'Fictional common fund request',evidence:null,evidence_sha256:null};
   assert.equal((await value(db,`select public.cartera_operador_solicitar_provision('${id}',${quote(JSON.stringify(payload))}::jsonb)`)).payment_executed,false);
  }
  assert.equal((await data('fund_book')).actions.length,2);assert.equal((await data('events')).length,2);
  await db.exec(`set session authorization postgres;update credit_portfolio_operators set capability='read' where perfil_id='${operator}'`);await asActor(db);
  assert.equal((await data('events')).length,1);
  for(const [name,args]of[['cut',`,null,'${cut.id}'`],['collection_history',`,null,'${other}'`],['customer_history',`,null,'${other}'`],['fund_book','']])await denied(data(name,args),/cartera_quality_capability_required/);
  await denied(value(db,`select public.cartera_operador_guardar_gestion(gen_random_uuid(),'${other}','note','internal','Fictional blocked after revocation')`),/cartera_manage_required/);
  await denied(value(db,"select public.cartera_operador_solicitar_provision(gen_random_uuid(),'{\"kind\":\"request\"}'::jsonb)"),/cartera_manage_required/);
 }finally{await db.close();}
});

test('a fourth managed storage relation blocks installation, activation and the integrated gate',async()=>{
 let db=await setup({install:false});try{
  await db.exec('create table storage.fiction_future(id int);alter table storage.fiction_future enable row level security;grant select on storage.fiction_future to authenticated;create policy broad on storage.fiction_future for select to authenticated using(true);');
  await assert.rejects(db.exec(read('candidate/scope-full.sql')),/cartera_managed_inventory_changed/);await db.exec('rollback');
  assert.equal(await value(db,"select to_regprocedure('public.cartera_subject()')"),null);
 }finally{await db.close();}
 db=await setup();try{
  await db.exec('create table storage.fiction_future(id int);alter table storage.fiction_future enable row level security;grant select on storage.fiction_future to authenticated;create policy broad on storage.fiction_future for select to authenticated using(true);');
  await assert.rejects(enableFictional(db),/cartera_managed_inventory_changed/);
  assert.equal(await value(db,'select enabled from kora_private.cartera_contract'),false);
  assert.match(checkCarteraCoverage(await value(db,read('candidate/catalog-query.sql'))).join(','),/unexpected\/duplicate.*storage.fiction_future/);
 }finally{await db.close();}
});

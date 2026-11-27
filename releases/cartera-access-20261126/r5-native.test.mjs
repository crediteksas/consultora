import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fullSetup,enableFictional,value} from './full-fixture.mjs';
import {read} from './core-fixture.mjs';

// Import the real generated checker from its intended deployment layout.
const temp=mkdtempSync(join(tmpdir(),'cartera-isolation-gate-'));
const target=join(temp,'scripts/supabase-compat');
mkdirSync(target,{recursive:true});
for(const name of ['check-permission-contract.mjs','cartera-coverage-gate.mjs','cartera-managed-inventory.mjs'])
 copyFileSync(new URL('./candidate/'+name,import.meta.url),join(target,name));
const {checkPermissionContract}=await import(pathToFileURL(join(target,'check-permission-contract.mjs')).href);
test.after(()=>rmSync(temp,{recursive:true}));
const checker=snapshot=>checkPermissionContract({before:snapshot,after:snapshot,contract:{schema_version:1,project:'fixture',objects:[]},created:[]});

const cases=[
 {name:'PUBLIC permissive policy',denied:true,sql:'create policy fictional_public on storage.migrations for select to public using(true);'},
 {name:'inherited permissive policy',denied:true,usage:true,sql:'create role fictional_storage_scope nologin;grant fictional_storage_scope to authenticated with inherit true,set false;create policy fictional_inherited on storage.migrations for select to fictional_storage_scope using(true);'},
 {name:'non-inherited membership control',denied:false,usage:false,sql:'create role fictional_storage_scope nologin;grant fictional_storage_scope to authenticated with inherit false,set false;create policy fictional_noninherited on storage.migrations for select to fictional_storage_scope using(true);'},
 {name:'RLS disabled',denied:true,sql:'alter table storage.migrations disable row level security;'},
];

for(const scenario of cases)test('inventoried managed relation: '+scenario.name,async()=>{
 // The object is already in the reviewed inventory. No new-table check can
 // mask the isolation predicate under test.
 let {db}=await fullSetup({install:false});
 try{
  await db.exec(scenario.sql);
  if(scenario.usage!==undefined){
   assert.equal(await value(db,"select pg_has_role('authenticated','fictional_storage_scope','MEMBER')"),true);
   assert.equal(await value(db,"select pg_has_role('authenticated','fictional_storage_scope','USAGE')"),scenario.usage);
  }
  if(scenario.denied){
   for(const file of ['scope-core.sql','scope-full.sql']){
    await assert.rejects(db.exec(read('candidate/'+file)),/cartera_managed_surface_not_isolated/);
    await db.exec('rollback');
    assert.equal(await value(db,"select count(*) from pg_roles where rolname='kora_cartera_operator'"),0);
    assert.equal(await value(db,"select to_regprocedure('public.cartera_subject()')"),null);
   }
  }else{
   await db.exec(read('candidate/scope-full.sql'));
   await db.query('select kora_private.cartera_assert_ready()');
   assert.equal(checker(await value(db,read('candidate/catalog-query.sql'))).ok,true);
   await enableFictional(db);
   assert.equal(await value(db,'select enabled from kora_private.cartera_contract'),true);
  }
 }finally{await db.close();}

 ({db}=await fullSetup());
 try{
  const originalSeal=await value(db,'select fingerprint from kora_private.cartera_contract');
  await db.exec(scenario.sql);
  if(scenario.denied){
   await assert.rejects(db.query('select kora_private.cartera_assert_ready()'),/cartera_managed_surface_not_isolated/);
   await assert.rejects(enableFictional(db),/cartera_managed_surface_not_isolated/);
  }else{
   await db.query('select kora_private.cartera_assert_ready()');
   // A non-inherited policy is isolated, but catalog drift still cannot be
   // self-approved. Its old seal must reject activation for the right reason.
   await assert.rejects(enableFictional(db),/cartera_activation_catalog_unreviewed/);
  }
  assert.equal(await value(db,'select enabled from kora_private.cartera_contract'),false);
  assert.equal(await value(db,'select fingerprint from kora_private.cartera_contract'),originalSeal);
  const result=checker(await value(db,read('candidate/catalog-query.sql')));
  assert.equal(result.ok,!scenario.denied);
  if(scenario.denied)assert.ok(result.errors.includes('Cartera managed surface not isolated: storage.migrations'),JSON.stringify(result.errors));
  else assert.deepEqual(result.errors,[]);
 }finally{await db.close();}
});

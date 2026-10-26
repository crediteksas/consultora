import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
import{createDb,consult,register,payload,state,user,who,admin}from'../erp/fixtures/socios-inventario.mjs';
import{sociosPermissionObjects,sociosCreatedInventory}from'../../scripts/supabase-compat/socios-contract.mjs';
const query=await readFile(new URL('../../scripts/supabase-compat/catalog-query.sql',import.meta.url),'utf8');
const get=async db=>{await db.exec('reset role');const d=(await db.query(query)).rows[0].snapshot;await user(db);return d;};
const setup=async t=>{const db=await createDb({supabaseFutureDefaults:true});t.after(()=>db.close());return db;};
test('compat Socios: exact native source private rights and triggers after future public defaults',async t=>{
 const db=await setup(t),snapshot=await get(db);const objects=sociosPermissionObjects(snapshot,{isolationTest:'tests/security/supabase-compatibility-socios.test.mjs'});
 assert.equal(objects.length,9);assert.equal(sociosCreatedInventory().length,9);assert.ok(objects.filter(x=>x.kind==='r').every(x=>x.grants.length===0&&x.rls&&x.policy_count===0));
 assert.ok((await consult(db)).cortes.length>0);
 for(const name of ['socios_grupos_tienda','socios_resultados','socios_operaciones','socios_destinos'])await assert.rejects(db.query('select * from inventario_control.'+name),e=>e.code==='42501');
});
test('compat Socios: source executes with future defaults, contribution and repeated request preserve exact money',async t=>{
 const db=await setup(t),data=await payload(db),first=await register(db,data),before=await state(db);const again=await register(db,data);assert.equal(again.operacion,first.operacion);assert.equal(again.reutilizado,true);assert.deepEqual(await state(db),before);assert.equal(before.cash_out,'1000');assert.equal(before.target_debt,'1700');assert.equal(before.supplier_debt,'700');assert.equal(before.bank,0);
});
test('compat Socios: source denies other management, store, inactive controller and anonymous',async t=>{
 const db=await setup(t);
 for(const actor of [who.auditor,who.store,who.off]){await user(db,actor);await assert.rejects(consult(db),/Solo Mayte/);}
 await user(db);await admin(db,'update public.perfiles set activo=false where id=$1',[who.mayte]);await assert.rejects(consult(db),/Solo Mayte/);
 await db.exec('reset role;set role anon');await assert.rejects(db.query("select public.socios_inventario('consultar','{}',null)"),e=>e.code==='42501');
});
test('compat Socios: source contract rejects changed definer, anonymous execution, policy and trigger drift',async t=>{
 const db=await setup(t),base=await get(db);const run=d=>sociosPermissionObjects(d,{isolationTest:'tests/security/supabase-compatibility-socios.test.mjs'});
 for(const mutate of [
 d=>{d.functions.find(f=>f.name==='socios_api').security_definer=false;},
 d=>{d.functions.find(f=>f.name==='socios_api').grants.push({grantor:'postgres',grantee:'anon',privilege:'EXECUTE',grantable:false});},
 d=>{d.relations.find(r=>r.name==='socios_destinos').policy_count=1;},
 d=>{d.triggers.find(t=>t.name==='socios_destinos_inmutable').enabled='D';},
 d=>{d.relations.find(r=>r.name==='socios_destinos').columns[0].acl='{anon=r/postgres}';},
 ]){const d=structuredClone(base);mutate(d);assert.throws(()=>run(d),/Socios/);}
});

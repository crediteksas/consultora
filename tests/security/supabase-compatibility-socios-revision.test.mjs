import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
import{closureDb,installRevision,legacy,reviewPayload,confirmReview}from'../erp/fixtures/socios-revision.mjs';
import{user}from'../erp/fixtures/socios-inventario.mjs';
import{sociosPermissionObjects,sociosCreatedInventory}from'../../scripts/supabase-compat/socios-revision-contract.mjs';
const query=await readFile(new URL('../../scripts/supabase-compat/catalog-query.sql',import.meta.url),'utf8');
const get=async db=>{await db.exec('reset role');const d=(await db.query(query)).rows[0].snapshot;await user(db);return d;};
const check=s=>sociosPermissionObjects(s,{isolationTest:'tests/security/supabase-compatibility-socios-revision.test.mjs'});
const setup=async t=>{const db=await closureDb(t,{supabaseFutureDefaults:true});await installRevision(db,{realClosure:true});return db;};
test('compat revisión:13 exact source objects, finite RPC grants, private immutable review table',async t=>{
 const db=await setup(t),snapshot=await get(db);assert.equal(check(snapshot).length,13);assert.equal(sociosCreatedInventory().length,13);
 for(const role of ['authenticated','service_role','anon']){await db.exec('reset role;set role '+role);await assert.rejects(db.query('select * from inventario_control.socios_retiros_revisiones'),e=>e.code==='42501');}
});
test('compat revisión: reject privilege escalation, code drift, mutable history and column grants',async t=>{
 const base=await get(await setup(t));
 for(const mutate of[
 d=>d.functions.find(f=>f.name==='socios_retiro_fuente').security_definer=true,
 d=>d.functions.find(f=>f.name==='socios_revision_api').grants.push({grantor:'postgres',grantee:'service_role',privilege:'EXECUTE',grantable:false}),
 d=>d.functions.find(f=>f.name==='socios_resultado').definition_md5='f'.repeat(32),
 d=>d.relations.find(r=>r.name==='socios_retiros_revisiones').rls=false,
 d=>d.relations.find(r=>r.name==='socios_retiros_revisiones').columns[0].acl='{anon=r/postgres}',
 d=>d.triggers.find(t=>t.name==='socios_retiros_revisiones_inmutable').enabled='D',
 ]){const s=structuredClone(base);mutate(s);assert.throws(()=>check(s),/Socios/);}
});

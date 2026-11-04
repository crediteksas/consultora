import {PGlite} from '@electric-sql/pglite';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
export const folder='tests/fixtures/supabase-compat/alo-accesorios';
export const migration='supabase/migrations/20261104174100_alo_total_accesorios_rectificacion.sql';
export const testPath='tests/security/supabase-compatibility-alo-accesorios.test.mjs';
const read=p=>readFileSync(p,'utf8'),hash=s=>createHash('sha256').update(s).digest('hex');
const targets=new Set(['calcular_liquidacion_sin_datos_pago','aliados_impedir_cambio_aprobado','aliados_impedir_cambio_operacion_aprobada','tesoreria_generar_destinos_liquidacion']);
export async function capture(scenario) {
 const db=await PGlite.create();
 try {
  await db.exec(read(folder+'/before-fixture.sql'));
  if(scenario==='rebuild')await db.exec('ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;');
  const query=read('scripts/supabase-compat/catalog-query.sql');
  const catalog=async()=>{const d=Object.values((await db.query(query)).rows[0])[0];delete d.captured_at;return d;};
  const before=await catalog();await db.exec(read(migration));const after=await catalog();
  const changed=after.functions.filter(f=>targets.has(f.name));
  assert.equal(changed.length,4);
  for(const f of changed) {
   const old=before.functions.find(o=>o.schema===f.schema&&o.name===f.name&&o.identity===f.identity);
   assert.ok(old);assert.deepEqual(f.grants,old.grants);assert.equal(f.security_definer,old.security_definer);assert.deepEqual(f.config,old.config);
  }
  const fn=after.functions.find(f=>f.name==='rectificar_alo_accesorios');
  const table=after.relations.find(f=>f.name==='rectificaciones_alo_accesorios');
  assert.equal(fn.security_definer,false);assert.ok(table.rls);assert.equal(table.policy_count,0);
  for(const o of [fn,table])assert.deepEqual(o.grants.filter(g=>g.grantee!==o.owner),[]);
  // Grant schema USAGE locally so denials test the object ACL, not a schema barrier.
  await db.exec('GRANT USAGE ON SCHEMA kora_private TO anon,authenticated,service_role;');
  for(const role of ['anon','authenticated','service_role']){
   await db.exec('SET ROLE '+role);
   await assert.rejects(db.query("select kora_private.rectificar_alo_accesorios(null,null,1,1,1)"),e=>e.code==='42501');
   await assert.rejects(db.query('select * from kora_private.rectificaciones_alo_accesorios'),e=>e.code==='42501');
   await db.exec('RESET ROLE');
  }
  const objs=[...changed.map(f=>({...f,kind:'function'})),{...fn,kind:'function'},table];
  const contract={schema_version:1,project:'kora',objects:objs.map(o=>({...o,grants:o.grants.filter(g=>g.grantee!==o.owner),column_acls:{},isolation_test:testPath,justification:targets.has(o.name)?'Existing function ACL and security mode preserved; exact code-only body patched in isolated fixture':'Private audit/correction only; no API role can select or execute'}))};
  const created=objs.map(o=>({schema:o.schema,name:o.name,kind:o.kind,...(o.identity===undefined?{}:{identity:o.identity})}));
  return {before,after,contract,created};
 }finally{await db.close();}
}
export async function emit(){
 const pinned=(p,value)=>{const s=JSON.stringify(value,null,2)+'\n';writeFileSync(p,s);return {path:p,sha256:hash(s)};};
 const evidence={schema_version:1,project:'kora',scope:'Aló isolated permission delta. Real code-only modified functions; reduced dependency tables; not a full schema or HTTP/RLS certification.',migration_sha256:{[migration]:hash(read(migration))},isolation_tests:[{path:testPath,sha256:hash(read(testPath))}],test_runner_sha256:hash(read('scripts/run-kora-local-tests.mjs'))};
 for(const scenario of ['upgrade','rebuild']){
  const data=await capture(scenario);evidence[scenario]={};
  for(const [k,v]of Object.entries(data))evidence[scenario][k]=pinned(folder+'/'+scenario+'-'+k+'.json',v);
 }
 return pinned(folder+'/release.json',evidence);
}
if(process.argv.includes('--emit'))console.log(JSON.stringify(await emit()));

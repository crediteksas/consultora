import {PGlite} from '@electric-sql/pglite';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
export const folder='tests/fixtures/supabase-compat/caja-redondeo';
export const migration='supabase/migrations/20261105174630_caja_arqueo_redondeo_pesos.sql';
export const testPath='tests/security/supabase-compatibility-caja-redondeo.test.mjs';
const read=p=>readFileSync(p,'utf8'),hash=s=>createHash('sha256').update(s).digest('hex');
export async function capture(scenario){
 const db=await PGlite.create();
 try {
  const source=read('tests/erp/caja-ciclo-automatico.test.mjs');
  const fixture=source.match(/await db\.exec\(`([\s\S]*?)`\);/);assert.ok(fixture);
  await db.exec(fixture[1]);
  for(const file of ['20260906191354_caja_arrastre_movimientos_retroactivos.sql','20260920181612_caja_corte_arqueo_apertura.sql','20260921231517_caja_cierre_manual_y_corte_automatico.sql','20260926221259_caja_primera_apertura_sin_doble_descuento.sql'])await db.exec(read('supabase/migrations/'+file));
  if(scenario==='rebuild')await db.exec('ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;');
  const query=read('scripts/supabase-compat/catalog-query.sql');
  const catalog=async()=>{const d=Object.values((await db.query(query)).rows[0])[0];delete d.captured_at;return d;};
  const before=await catalog();await db.exec(read(migration));const after=await catalog();
  const f=after.functions.find(o=>o.schema==='public'&&o.name==='validar_arqueo_caja');
  const old=before.functions.find(o=>o.schema===f.schema&&o.name===f.name&&o.identity===f.identity);
  assert.ok(old);assert.deepEqual(f.grants,old.grants);assert.equal(f.security_definer,old.security_definer);assert.deepEqual(f.config,old.config);
  await db.exec('SET ROLE anon;');await assert.rejects(db.query("select public.validar_arqueo_caja(null,null,null,null,null,false)"),e=>e.code==='42501');await db.exec('RESET ROLE;');
  const obj={...f,kind:'function'};
  const contract={schema_version:1,project:'kora',objects:[{...obj,grants:f.grants.filter(g=>g.grantee!==f.owner),column_acls:{},isolation_test:testPath,justification:'Existing RPC retains its exact grants and security mode; fixture checks access and cash rounding'}]};
  const created=[{schema:f.schema,name:f.name,kind:'function',identity:f.identity}];return {before,after,contract,created};
 }finally{await db.close();}
}
export async function emit(){
 const pinned=(p,value)=>{const s=JSON.stringify(value,null,2)+'\n';writeFileSync(p,s);return {path:p,sha256:hash(s)};};
 const evidence={schema_version:1,project:'kora',scope:'Caja rounding permission delta; reduced isolated cash fixture, not full RLS or HTTP certification.',migration_sha256:{[migration]:hash(read(migration))},isolation_tests:[{path:testPath,sha256:hash(read(testPath))}],test_runner_sha256:hash(read('scripts/run-kora-local-tests.mjs'))};
 for(const scenario of ['upgrade','rebuild']){const data=await capture(scenario);evidence[scenario]={};for(const [k,v]of Object.entries(data))evidence[scenario][k]=pinned(folder+'/'+scenario+'-'+k+'.json',v);}
 return pinned(folder+'/release.json',evidence);
}
if(process.argv.includes('--emit'))console.log(JSON.stringify(await emit()));

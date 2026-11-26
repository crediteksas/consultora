import {PGlite} from '@electric-sql/pglite';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {checkPermissionContract} from './check-permission-contract.mjs';
export const folder='tests/fixtures/supabase-compat/rectificacion-soporte-aliados';
export const migration='supabase/migrations/20261126192204_rectificacion_soporte_aliados.sql';
export const testPath='tests/security/supabase-compatibility-rectificacion-soporte-aliados.test.mjs';
const read=p=>readFileSync(p,'utf8'),hash=s=>createHash('sha256').update(s).digest('hex');
export async function capture(scenario){
 const db=await PGlite.create();try{
  if(scenario==='rebuild')await db.exec('alter default privileges revoke execute on functions from public');
  await db.exec(read(folder+'/baseline.sql'));
  const query=read('scripts/supabase-compat/catalog-query.sql');
  const catalog=async()=>{const c=Object.values((await db.query(query)).rows[0])[0];delete c.captured_at;return c;};
  const before=await catalog();await db.exec(read(migration));const after=await catalog();
  const f=after.functions.find(x=>x.schema==='kora_private'&&x.name==='banco_creditek_pago_trigger');
  const old=before.functions.find(x=>x.schema===f.schema&&x.name===f.name&&x.identity===f.identity);
  assert.ok(old);assert.deepEqual(f.grants,old.grants);assert.equal(f.security_definer,old.security_definer);assert.deepEqual(f.config,old.config);
  const rectify=after.functions.find(x=>x.schema==='kora_private'&&x.name==='rectificar_soporte_aliado');
  const table=after.relations.find(x=>x.schema==='kora_private'&&x.name==='rectificaciones_soporte_aliados');
  assert.ok(table.rls);assert.equal(rectify.security_definer,false);
  for(const o of [rectify,table])assert.deepEqual(o.grants.filter(g=>g.grantee!==o.owner),[]);
  const objs=[{...f,kind:'function'},{...rectify,kind:'function'},table];
  const contract={schema_version:1,project:'kora',objects:objs.map(o=>({...o,grants:o.grants.filter(g=>g.grantee!==o.owner),column_acls:{},isolation_test:testPath,justification:'Restricción privada; conserva privilegios existentes y registra reverso sin ejecutar transferencias.'}))};
  const created=objs.map(o=>({schema:o.schema,name:o.name,kind:o.kind,...(o.identity===undefined?{}:{identity:o.identity})}));
  const checked=checkPermissionContract({before,after,contract,created});assert.ok(checked.ok,checked.errors.join('; '));
  return {before,after,contract,created};
 }finally{await db.close();}
}
if(process.argv.includes('--emit')){
 mkdirSync(folder,{recursive:true});const pin=(path,v)=>{const s=JSON.stringify(v,null,2)+'\n';writeFileSync(path,s);return{path,sha256:hash(s)};};
 const release={schema_version:1,project:'kora',scope:'Prueba aislada de permisos para rectificación de soporte, no prueba de producción.',migration_sha256:{[migration]:hash(read(migration))},isolation_tests:[{path:testPath,sha256:hash(read(testPath))}],test_runner_sha256:hash(read('scripts/run-kora-local-tests.mjs')),fixture_sha256:hash(read(folder+'/baseline.sql')),emitter_sha256:hash(read('scripts/supabase-compat/rectificacion-soporte-aliados-evidence.mjs'))};
 for(const s of ['upgrade','rebuild']){release[s]={};for(const[k,v]of Object.entries(await capture(s)))release[s][k]=pin(folder+'/'+s+'-'+k+'.json',v);}
 const ref=pin(folder+'/release.json',release),root='config/kora-permission-release.json',e=JSON.parse(read(root));e.additional_releases=e.additional_releases.filter(x=>x.path!==ref.path);e.additional_releases.push(ref);pin(root,e);
 console.log('Evidencia de permisos generada.');
}

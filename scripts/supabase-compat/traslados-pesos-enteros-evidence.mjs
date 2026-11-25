import {PGlite} from '@electric-sql/pglite';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {checkPermissionContract} from './check-permission-contract.mjs';
export const folder='tests/fixtures/supabase-compat/traslados-pesos-enteros';
export const migration='supabase/migrations/20261125211717_traslados_cartera_pesos_enteros.sql';
export const testPath='tests/security/supabase-compatibility-traslados-pesos-enteros.test.mjs';
const read=p=>readFileSync(p,'utf8'),hash=s=>createHash('sha256').update(s).digest('hex');
export async function capture(scenario){
 const db=await PGlite.create();
 try{
  if(scenario==='rebuild')await db.exec('alter default privileges revoke execute on functions from public');
  await db.exec(read(folder+'/baseline.sql'));
  const query=read('scripts/supabase-compat/catalog-query.sql');
  const catalog=async()=>{const c=Object.values((await db.query(query)).rows[0])[0];delete c.captured_at;return c;};
  const before=await catalog();await db.exec(read(migration));const after=await catalog();
  const f=after.functions.find(x=>x.schema==='public'&&x.name==='aprobar_traslado_recepcion');
  const old=before.functions.find(x=>x.schema===f.schema&&x.name===f.name&&x.identity===f.identity);
  assert.ok(old);assert.notEqual(f.definition_md5,old.definition_md5);
  assert.deepEqual(f.grants,old.grants);assert.equal(f.security_definer,old.security_definer);assert.deepEqual(f.config,old.config);
  assert.deepEqual(after.relations,before.relations);assert.deepEqual(after.policies,before.policies);assert.deepEqual(after.triggers,before.triggers);
  assert.deepEqual(after.functions.filter(x=>x!==f),before.functions.filter(x=>x!==old));
  await db.exec('set role anon');await assert.rejects(db.query('select public.aprobar_traslado_recepcion(null)'),{code:'42501'});
  await db.exec("reset role;set test.central='no';set role authenticated");
  await assert.rejects(db.query('select public.aprobar_traslado_recepcion(null)'),/Solo Gerencia o Auditoría/);
  await db.exec('reset role');
  const contract={schema_version:1,project:'kora',objects:[{...f,kind:'function',grants:f.grants.filter(g=>g.grantee!==f.owner),column_acls:{},isolation_test:testPath,
   justification:'Existing approval RPC keeps identical grants and security mode. Fictitious tests cover financial precision, inventory, rollback, retry and role denial.'}]};
  const created=[{schema:f.schema,name:f.name,kind:'function',identity:f.identity}];
  const checked=checkPermissionContract({before,after,contract,created});assert.ok(checked.ok,checked.errors.join('\n'));
  return{before,after,contract,created};
 }finally{await db.close();}
}
if(process.argv.includes('--emit')){
 mkdirSync(folder,{recursive:true});
 const pin=(path,value)=>{const s=JSON.stringify(value,null,2)+'\n';writeFileSync(path,s);return{path,sha256:hash(s)};};
 const release={schema_version:1,project:'kora',scope:'Isolated upgrade/rebuild of one transfer approval precision fix; fictitious fixture, no production operations or new permissions.',
  migration_sha256:{[migration]:hash(read(migration))},isolation_tests:[{path:testPath,sha256:hash(read(testPath))}],test_runner_sha256:hash(read('scripts/run-kora-local-tests.mjs')),
  fixture_sha256:hash(read(folder+'/baseline.sql')),emitter_sha256:hash(read('scripts/supabase-compat/traslados-pesos-enteros-evidence.mjs'))};
 for(const scenario of ['upgrade','rebuild']){release[scenario]={};for(const[k,v]of Object.entries(await capture(scenario)))release[scenario][k]=pin(folder+'/'+scenario+'-'+k+'.json',v);}
 const ref=pin(folder+'/release.json',release);const path='config/kora-permission-release.json';const root=JSON.parse(read(path));
 root.additional_releases=root.additional_releases.filter(x=>x.path!==ref.path);root.additional_releases.push(ref);pin(path,root);
 console.log('Evidence verified and pinned: one function, unchanged privileges.');
}

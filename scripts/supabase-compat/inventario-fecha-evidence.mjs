// Combined isolated PGlite evidence for the existing four source deltas plus date reconciliation.
// No production connection, customer rows, copied catalogs merged across databases or grants are used.
import{readFileSync,writeFileSync,mkdirSync,existsSync}from'node:fs';import{createHash}from'node:crypto';import assert from'node:assert/strict';
import{combinedDb,applyCombined,migrations}from'../../tests/erp/fixtures/inventario-fecha-permisos.mjs';
import{execFileSync}from'node:child_process';
import{checkFechaTriggers}from'./inventario-fecha-contract.mjs';
import{checkPermissionContract}from'./check-permission-contract.mjs';
const read=p=>readFileSync(p,'utf8'),sha=b=>createHash('sha256').update(b).digest('hex'),stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const rootPath='config/kora-permission-release.json',archive='tests/fixtures/supabase-compat/inventario-fecha-combined/prior-native-release.json';
const priorBytes=execFileSync('git',['show','a0859197:config/kora-permission-release.json']);
assert.equal(sha(priorBytes),'d398cda1d24e69635224f1a9992fdbbbfda3f2c0d220d5ae0d5f3a0da3cb8391');
const prior=JSON.parse(priorBytes);
const folder='tests/fixtures/supabase-compat/inventario-fecha-combined';mkdirSync(folder,{recursive:true});
const pin=(path,value)=>{const body=JSON.stringify(value,null,2)+'\n';writeFileSync(path,body);return{path,sha256:sha(body)};};
writeFileSync(archive,priorBytes);const priorRef={path:archive,sha256:sha(priorBytes)};
const testPath='tests/security/supabase-compatibility-inventario-fecha.test.mjs';
const evidence={schema_version:1,project:'kora',scope:'Combined isolated PGlite upgrade/rebuild of five exact SQL source deltas; bounded fixtures, not full production reconstruction. Prior native proofs retained.',
 migration_sha256:Object.fromEntries(migrations.map(p=>[p,sha(read(p))])),isolation_tests:[...prior.isolation_tests,{path:testPath,sha256:sha(read(testPath))}],test_runner_sha256:sha(read('scripts/run-kora-local-tests.mjs')),
 prior_native_release:priorRef,fixture_sha256:sha(read('tests/erp/fixtures/inventario-fecha-permisos.mjs')),emitter_sha256:sha(read('scripts/supabase-compat/inventario-fecha-evidence.mjs')),
 additional_releases:prior.additional_releases};
for(const scenario of['upgrade','rebuild']){
 const oldContract=JSON.parse(read(prior[scenario].contract.path));
 const db=await combinedDb(scenario);try{
  const catalog=async()=>{const x=Object.values((await db.query(read('scripts/supabase-compat/catalog-query.sql'))).rows[0])[0];delete x.captured_at;return x;};
  const before=await catalog();await applyCombined(db);const after=await catalog();
  const objects=oldContract.objects.map(old=>{
   const candidates=old.kind==='function'?after.functions:after.relations;
   const matches=candidates.filter(o=>o.schema===old.schema&&o.name===old.name);assert.equal(matches.length,1,'Object must resolve exactly: '+old.name);
   const o=matches[0],grants=o.grants.filter(g=>g.grantee!==o.owner);
   const rights=a=>a.map(g=>[g.grantee,g.privilege,g.grantable]).sort();assert.deepEqual(rights(grants),rights(old.grants),'No new inherited rights: '+o.name);
   return{...o,kind:old.kind,grants,column_acls:{},isolation_test:testPath,justification:'Exact reviewed source replay in a disposable combined fixture; preserves finite approved rights.'};
  });
  const table=after.relations.find(o=>o.schema==='inventario_control'&&o.name==='ventas_fechas_conciliadas');assert(table.rls);assert.deepEqual(table.grants.filter(g=>g.grantee!==table.owner),[]);
  objects.push({...table,grants:[],column_acls:{},isolation_test:testPath,justification:'Private immutable reconciliation ledger; no client or service-role access.'});
  const expectedTriggers=checkFechaTriggers(before,after);
  const created=objects.map(({schema,name,kind,identity})=>({schema,name,kind,identity}));
  const contract={schema_version:1,project:'kora',objects,allow_catalog_changes:{triggers:stable(expectedTriggers)}};
  const result=checkPermissionContract({before,after,contract,created});assert(result.ok,result.errors.join('\n'));
  evidence[scenario]=Object.fromEntries(Object.entries({before,after,contract,created}).map(([k,v])=>[k,pin(folder+'/'+scenario+'-'+k+'.json',v)]));
 }finally{await db.close();}
}
pin(rootPath,evidence);console.log('Combined permission evidence generated from two actual disposable databases.');

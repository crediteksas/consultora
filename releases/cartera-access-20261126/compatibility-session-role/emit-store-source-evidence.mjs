import{readFileSync as read,writeFileSync as write,mkdirSync}from'node:fs';import{createHash}from'node:crypto';import assert from'node:assert/strict';
import{checkPermissionContract}from'./candidate/check-permission-contract.mjs';
const folder='tests/fixtures/supabase-compat/cartera-access',testPath='tests/security/supabase-compatibility-cartera-access.test.mjs';
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const sha=s=>createHash('sha256').update(s).digest('hex'),key=o=>o.schema+'.'+o.name+(o.identity===undefined?'':'('+o.identity+')');
const objs=s=>[...s.relations,...s.functions.map(f=>({...f,kind:'function'}))];
const oldPath='tests/fixtures/supabase-compat/cobra-krediya/release.json',old=JSON.parse(read(oldPath));
const oldObjects=new Set(JSON.parse(read(old.upgrade.contract.path)).objects.map(key));
mkdirSync(folder,{recursive:true});
const pin=(p,data)=>{const body=JSON.stringify(data,null,2)+'\n';write(p,body);return{path:p,sha256:sha(body)};};
const migrations=[...Object.keys(old.migration_sha256),'supabase/migrations/20261127020616_cobra_krediya_evolution_provision_review.sql','supabase/migrations/20261127025816_cartera_dedicated_session_access.sql','supabase/migrations/20261127195036_cartera_independiente_confirmacion_tienda.sql','supabase/migrations/20261127203343_cobra_corte_tienda_fuente.sql'];
const release={schema_version:1,project:'kora',scope:'Combined Cartera access and independent store debt guard in fictional upgrade/rebuild on PostgreSQL/Auth/PostgREST. The dedicated restricted mode remains disabled and refuses activation after the changed guard; prior native proof is retained. Fixture pins for unrelated guards and ACL differ from production and are explicitly substituted. New KrediYA cut stores the provider store while retaining identity and amount validation, without changing any source ledger. No production clone or operations.',migration_sha256:Object.fromEntries(migrations.map(p=>[p,sha(read(p))])),isolation_tests:[{path:testPath,sha256:sha(read(testPath))},{path:'tests/security/supabase-compatibility-cartera-independiente.test.mjs',sha256:sha(read('tests/security/supabase-compatibility-cartera-independiente.test.mjs'))},{path:'tests/security/supabase-compatibility-krediya-tienda-fuente.test.mjs',sha256:sha(read('tests/security/supabase-compatibility-krediya-tienda-fuente.test.mjs'))}],test_runner_sha256:sha(read('scripts/run-kora-local-tests.mjs')),supersedes:[{path:oldPath,sha256:sha(read(oldPath))}],prior_independent_receipts:Object.fromEntries(['upgrade','rebuild'].map(s=>{const path=folder+'/'+s+'-independiente-prior-native-result.json';const body=read(path);assert.equal(JSON.parse(body).passed,true);return [s,{path,sha256:sha(body)}]})),prior_native_receipts:Object.fromEntries(['upgrade','rebuild'].map(s=>{const path=folder+'/'+s+'-prior-native-result.json';const body=read(path);assert.equal(JSON.parse(body).passed,true);return [s,{path,sha256:sha(body)}]}))};
for(const scenario of['upgrade','rebuild']){
 const src=process.argv[scenario==='upgrade'?2:3];const before=JSON.parse(read(src+'/before.json')),after=JSON.parse(read(src+'/after.json')),native=JSON.parse(read(src+'/result.json'));
 assert.equal(native.passed,true);assert.equal(native.scenario,scenario);assert.equal(native.production_operations,0);
 const prior=new Map(objs(before).map(o=>[key(o),o])),overlays=[],contractObjects=[];
 for(const o of objs(after)){
  const k=key(o),b=prior.get(k);
  const onlyOverlay=b&&o.schema==='public'&&['r','p'].includes(o.kind)&&o.policy_count===b.policy_count+1&&stable({...o,policy_count:0})===stable({...b,policy_count:0})&&!oldObjects.has(k);
  if(onlyOverlay){overlays.push({schema:o.schema,name:o.name,before_count:b.policy_count,after_count:o.policy_count});continue;}
  if(!b||stable(b)!==stable(o)||oldObjects.has(k))contractObjects.push({...o,grants:o.grants.filter(g=>g.grantee!==o.owner),column_acls:Object.fromEntries((o.columns||[]).filter(c=>c.acl).map(c=>[c.name,c.acl])),isolation_test:testPath,justification:'Explicit bounded Cartera access; fixed scalar RPCs, origin scope, append-only idempotent review events, separate fund authorizer. No source ledger or payment writes.'});
 }
 const contract={schema_version:1,project:'kora',objects:contractObjects,cartera_restrictive_overlay:overlays,allow_catalog_changes:Object.fromEntries(['defaults','policies','role_config','schema_grants','triggers'].filter(k=>stable(before[k])!==stable(after[k])).map(k=>[k,stable(after[k])]))};
 const created=contractObjects.map(({schema,name,kind,identity})=>({schema,name,kind,identity}));
 const checked=checkPermissionContract({before,after,contract,created});assert.ok(checked.ok,checked.errors.join('\n'));
 release[scenario]=Object.fromEntries(Object.entries({before,after,contract,created}).map(([k,v])=>[k,pin(folder+'/'+scenario+'-'+k+'.json',v)]));
 release.native_receipts ||= {};release.native_receipts[scenario]=pin(folder+'/'+scenario+'-native-result.json',native);
 console.log(JSON.stringify({scenario,contracted:contractObjects.length,restrictive_overlays:overlays.length,native_api_checks:native.checks.length}));
}
pin(folder+'/release.json',release);

// Offline evidence emitter for the exact KORA SQL source delta from 40d0bbe7.
// Socios is ALREADY applied in production: this never runs/replays either SQL.
import{readFile,writeFile,mkdir,realpath}from'node:fs/promises';import{createHash}from'node:crypto';import path from'node:path';import{fileURLToPath}from'node:url';
import{sociosPermissionObjects,sociosCreatedInventory,expectedSociosTriggers,stableSociosCatalog}from'./socios-revision-contract.mjs';import{checkPermissionContract}from'./check-permission-contract.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const files={socios:'supabase/migrations/20261023032131_socios_inventario_retiros_aportes.sql',tariff:'supabase/migrations/20261021161019_kora_compat_select_krediya_price_rules.sql',review:'supabase/migrations/20261027192103_socios_revision_retiros_por_corte.sql'};
const tests=['tests/security/supabase-compatibility-socios-revision.test.mjs','tests/security/supabase-compatibility-catalog.test.mjs','tests/security/supabase-compatibility-rollback.test.mjs'];
import{tariffObject}from'./kora-source-batch-evidence.mjs';
export async function emitKoraReviewBatchEvidence({root,evidenceDir}){
 root=await realpath(root);evidenceDir=await realpath(evidenceDir);const read=async f=>JSON.parse(await readFile(f));const run=await read(evidenceDir+'/status.json');
 if(run.complete!==true||run.checks.length!==76||run.checks.some(c=>c.passed!==true)||run.production_operations!==0||run.external_sends!==0)throw Error('76 successful isolated native checks required');
 const harnessFiles=[path.resolve(evidenceDir,'../../native-review.py')];
 if(!/^[a-f0-9]{32}$/.test(run.run_id||'')||path.basename(evidenceDir)!==run.run_id||new Set(run.checks.map(c=>c.name)).size!==76)throw Error('Fresh unique attempt and distinct checks required');
 if(run.rollback_sha256!==sha(await readFile(root+'/docs/rollbacks/socios-revision-retiros.sql')))throw Error('Rollback differs from native proof');
 if(stableSociosCatalog(Object.keys(run.harness_source_sha256||{}).sort())!==stableSociosCatalog(harnessFiles.sort()))throw Error('Unexpected native harness provenance path');
 for(const file of harnessFiles){const hash=run.harness_source_sha256[file];if(!/^[a-f0-9]{64}$/.test(hash||'')||sha(await readFile(file))!==hash)throw Error('Native harness changed after run');}
 if(Object.keys(run.harness_source_sha256||{}).length!==1||run.catalog_query_sha256!==sha(await readFile(root+'/scripts/supabase-compat/catalog-query.sql')))throw Error('Pinned harness/catalog-query provenance required');
 const migration_sha256={};for(const[k,file]of Object.entries(files)){const hash=sha(await readFile(root+'/'+file));if(hash!==run.migration_sha256[k])throw Error('SQL differs from native source batch: '+file);migration_sha256[file]=hash;}
 const testRunner='scripts/run-kora-local-tests.mjs';
 const evidence={schema_version:1,project:'kora',scope:'actual three SQL source delta from unchanged40d baseline; original Socios and tariff are NOT production replay requests',migration_sha256,isolation_tests:await Promise.all(tests.map(async file=>({path:file,sha256:sha(await readFile(root+'/'+file))}))),test_runner_sha256:sha(await readFile(root+'/'+testRunner))};
 const folder='tests/fixtures/supabase-compat/kora-socios-review-native17';await mkdir(root+'/'+folder,{recursive:true});
 const put=async(file,value)=>{const body=JSON.stringify(value,null,2)+'\n';const dest=path.join(root,file);if(!dest.startsWith(root+path.sep))throw Error('Evidence escapes checkout');const parent=await realpath(path.dirname(dest));if(parent!==root&&!parent.startsWith(root+path.sep))throw Error('Evidence directory symlink escapes checkout');try{const existing=await realpath(dest);if(!existing.startsWith(root+path.sep))throw Error('Evidence file symlink escapes checkout');}catch(e){if(e.code!=='ENOENT')throw e;}await writeFile(dest,body);return{path:file,sha256:sha(body)};};
 for(const scenario of['upgrade','rebuild']){
  const input={};for(const phase of['before','after','restored']){const bytes=await readFile(evidenceDir+'/'+scenario+'-'+phase+'.json');if(sha(bytes)!==run.catalog_evidence?.[scenario]?.[phase+'_sha256'])throw Error('Native catalog pin mismatch: '+scenario+'/'+phase);input[phase]=JSON.parse(bytes);}
  const{before,after,restored}=input;
  const normalized=d=>({...d,relations:d.relations.map(({acl,...r})=>r)});if(stableSociosCatalog(normalized(restored))!==stableSociosCatalog(normalized(before)))throw Error('Local batch reversal did not restore effective catalog');
  const objects=[tariffObject(after,scenario),...sociosPermissionObjects(after,{isolationTest:tests[0]})];
  if(scenario==='upgrade'){
   const old=before.relations.find(r=>r.schema==='public'&&r.name==='krediya_price_rules');const next=after.relations.find(r=>r.schema==='public'&&r.name==='krediya_price_rules');if(stableSociosCatalog(old)!==stableSociosCatalog(next))throw Error('Upgrade must preserve all tariff metadata');
  }
  const created=sociosCreatedInventory();const expectedTriggers=expectedSociosTriggers(before);
  if(stableSociosCatalog(after.triggers)!==stableSociosCatalog(expectedTriggers))throw Error('Unreviewed trigger addition/removal');
  const contract={schema_version:1,project:'kora',objects,allow_catalog_changes:{triggers:stableSociosCatalog(expectedTriggers)}};
  const result=checkPermissionContract({before,after,contract,created});if(!result.ok)throw Error(scenario+': '+result.errors.join('; '));
  evidence[scenario]={};for(const[k,v]of Object.entries({before,after,contract,created}))evidence[scenario][k]=await put(folder+'/'+scenario+'-'+k+'.json',v);
 }
 evidence.native_result=await put(folder+'/native-result.json',run);
 await put('config/kora-permission-release.json',evidence);return{prepared:true,scope:'offline source-batch permission contract only',baseline_changed:false,production_sql_applied:false,production_ready:false};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 const options={};for(let i=2;i<process.argv.length;i+=2){const key={'--root':'root','--evidence-dir':'evidenceDir'}[process.argv[i]];if(!key||!process.argv[i+1])throw Error('Explicit --root and --evidence-dir required');options[key]=process.argv[i+1];}console.log(JSON.stringify(await emitKoraReviewBatchEvidence(options)));
}

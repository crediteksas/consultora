import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,rm,symlink,realpath} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {emitKoraSourceBatchEvidence} from '../../scripts/supabase-compat/kora-source-batch-evidence.mjs';
const root=path.resolve(new URL('../../',import.meta.url).pathname);
const sha=b=>createHash('sha256').update(b).digest('hex');
const base=path.join(root,'tests/fixtures/supabase-compat/kora-source-batch-native17');
// These unit tests reuse only isolated catalog evidence. They do not claim to
// run PostgreSQL or production; the native run is recorded separately.
async function fixture(t){
 const top=await realpath(await mkdtemp(path.join(os.tmpdir(),'compat-source-batch-')));t.after(()=>rm(top,{recursive:true,force:true}));
 const repo=path.join(top,'repo'),evidence=path.join(top,'native/evidence');await mkdir(evidence,{recursive:true});
 for(const file of ['supabase/migrations/20261023032131_socios_inventario_retiros_aportes.sql','supabase/migrations/20261021161019_kora_compat_select_krediya_price_rules.sql','scripts/supabase-compat/catalog-query.sql','scripts/run-kora-local-tests.mjs','tests/security/supabase-compatibility-socios.test.mjs','tests/security/supabase-compatibility-catalog.test.mjs','tests/security/supabase-compatibility-rollback.test.mjs']){
  await mkdir(path.dirname(path.join(repo,file)),{recursive:true});await copyFile(path.join(root,file),path.join(repo,file));
 }
 await mkdir(path.join(repo,'config'));const run=JSON.parse(await readFile(path.join(base,'native-result.json')));
 const harness=[path.join(evidence,'native-source-batch.py'),path.join(evidence,'../build-active-models.py')];
 run.harness_source_sha256={};for(const file of harness){await writeFile(file,'# synthetic provenance fixture only\n');run.harness_source_sha256[file]=sha(await readFile(file));}
 for(const scenario of ['upgrade','rebuild'])for(const phase of ['before','after']){const dest=path.join(evidence,scenario+'-'+phase+'.json');await copyFile(path.join(base,scenario+'-'+phase+'.json'),dest);run.catalog_evidence[scenario][phase+'_sha256']=sha(await readFile(dest));}
 // Restored effective ACL is identical to before; native provenance pins below
 // bind this synthetic unit fixture without pretending to be native evidence.
 for(const scenario of ['upgrade','rebuild']){await copyFile(path.join(base,scenario+'-before.json'),path.join(evidence,scenario+'-restored.json'));run.catalog_evidence[scenario].restored_sha256=sha(await readFile(path.join(evidence,scenario+'-restored.json')));}
 const save=()=>writeFile(path.join(evidence,'native-source-batch-status.json'),JSON.stringify(run));await save();
 return{repo,evidence,run,save,emit:()=>emitKoraSourceBatchEvidence({root:repo,evidenceDir:evidence}),mutate:async(scenario,edit)=>{const file=path.join(evidence,scenario+'-after.json'),d=JSON.parse(await readFile(file));edit(d);const b=JSON.stringify(d);await writeFile(file,b);run.catalog_evidence[scenario].after_sha256=sha(b);await save();}};
}
test('source batch emitter: isolated pinned batch emits both scenarios without changing baseline or SQL',async t=>{
 const f=await fixture(t),result=await f.emit();assert.equal(result.production_ready,false);assert.equal(result.production_sql_applied,false);const d=JSON.parse(await readFile(path.join(f.repo,'config/kora-permission-release.json')));assert.equal(Object.keys(d.migration_sha256).length,2);assert.ok(d.upgrade&&d.rebuild);
});
test('source batch emitter: matching a tampered catalog hash cannot authorize anonymous private access or unknown triggers',async t=>{
 for(const change of [d=>d.relations.find(x=>x.name==='socios_destinos').grants.push({grantor:'postgres',grantee:'anon',privilege:'SELECT',grantable:false}),d=>d.triggers.push({...d.triggers[0],name:'unreviewed_trigger'})]){
  const f=await fixture(t);await f.mutate('rebuild',change);await assert.rejects(f.emit(),/Socios|Unreviewed trigger/);
 }
});
test('source batch emitter: SQL, native-harness edits or missing checks invalidate provenance',async t=>{
 for(const mode of ['sql','harness','checks']){const f=await fixture(t);if(mode==='sql')await writeFile(path.join(f.repo,'supabase/migrations/20261021161019_kora_compat_select_krediya_price_rules.sql'),'-- edited');if(mode==='harness')await writeFile(path.join(f.evidence,'native-source-batch.py'),'# edited');if(mode==='checks'){f.run.checks.pop();await f.save();}await assert.rejects(f.emit(),/SQL differs|harness changed|42 successful/);}
});
test('source batch emitter: output symlink outside checkout is rejected before writing release evidence',async t=>{
 const f=await fixture(t),out=path.join(f.repo,'tests/fixtures/supabase-compat');await mkdir(out,{recursive:true});await symlink(path.dirname(f.evidence),path.join(out,'kora-source-batch-native17'));await assert.rejects(f.emit(),/symlink escapes/);
});

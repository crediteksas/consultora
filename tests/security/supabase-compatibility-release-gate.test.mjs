import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifySupabasePermissionRelease } from '../../scripts/supabase-compat/release-gate.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const source = 'create table public.fixture_gate(id integer); alter table public.fixture_gate enable row level security; grant select on public.fixture_gate to authenticated;';
const sqlPath='supabase/migrations/20990101000000_synthetic.sql';
const testPath='tests/security/supabase-compatibility-synthetic.test.mjs';
const empty = () => ({relations:[],functions:[],defaults:[],policies:[],role_config:[],schema_grants:[],triggers:[]});
const object = () => ({schema:'public',name:'fixture_gate',kind:'r',owner:'postgres',rls:true,force_rls:false,policy_count:1,columns:[{name:'id',type:'integer',identity:'',generated:'',acl:null}],grants:[{grantee:'authenticated',privilege:'SELECT',grantor:'postgres',grantable:false}]});
async function fixture({withEvidence=true,unchanged=false}={}) {
  const root=await mkdtemp(path.join(os.tmpdir(),'sb-permission-gate-'));
  const put=async(file,body)=>{await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),body);};
  const putJson=async(file,value)=>put(file,JSON.stringify(value));
  await put(sqlPath,source);
  await put('scripts/run-kora-local-tests.mjs',"const security = readdirSync('tests/security').filter(name => name.endsWith('.test.mjs')); // synthetic runner source");
  const baseline={schema_version:1,project:'kora',baseline_commit:'a'.repeat(40),migration_sha256:unchanged?{[sqlPath]:hash(source)}:{}};
  await putJson('config/kora-permission-baseline.json',baseline);
  const evidence={test_runner_sha256:hash(await readFile(path.join(root,'scripts/run-kora-local-tests.mjs'))),schema_version:1,project:'kora',migration_sha256:{[sqlPath]:hash(source)},isolation_tests:[{path:testPath,sha256:hash('// FICTITIOUS negative test source')}]};
  await put(testPath,'// FICTITIOUS negative test source');
  const data={};
  for(const scenario of ['upgrade','rebuild']) {
    const relation=object();
    data[scenario]={before:empty(),after:{...empty(),relations:[relation]},created:[{schema:'public',name:'fixture_gate',kind:'table'}],contract:{schema_version:1,project:'kora',objects:[{...structuredClone(relation),column_acls:{},justification:'Synthetic store-isolated access',isolation_test:testPath}]}};
  }
  const save=async()=>{
    for(const scenario of ['upgrade','rebuild']) {
      evidence[scenario]={};
      for(const [key,value] of Object.entries(data[scenario])) {
        const file='tests/fixtures/gate/'+scenario+'-'+key+'.json';const text=JSON.stringify(value);
        await put(file,text);evidence[scenario][key]={path:file,sha256:hash(text)};
      }
    }
    await putJson('config/kora-permission-release.json',evidence);
  };
  if(withEvidence)await save();
  return {root,put,putJson,baseline,evidence,data,save,close:()=>rm(root,{recursive:true,force:true})};
}
async function withFixture(options,run) { const f=await fixture(options);try{return await run(f);}finally{await f.close();} }

test('release gate: unchanged migration source requires no artificial release certificate',async()=>withFixture({unchanged:true,withEvidence:false},async f=>{
  assert.equal((await verifySupabasePermissionRelease(f)).scope,'no-migration-source-changes');
}));
test('release gate: changed SQL without reviewed isolated upgrade/rebuild evidence blocks publication',async()=>withFixture({withEvidence:false},async f=>{
  await assert.rejects(verifySupabasePermissionRelease(f),/reviewed upgrade\/rebuild permission evidence/);
}));
test('release gate: pinned synthetic permission contracts pass both scenarios',async()=>withFixture({},async f=>{
  const result=await verifySupabasePermissionRelease(f);assert.equal(result.ok,true);assert.deepEqual(result.checked.map(x=>x.scenario),['upgrade','rebuild']);
  assert.equal(result.scope,'offline-release-permission-contract-only');
}));
test('release gate: later SQL or test edit invalidates evidence before build',async()=>{
  for(const file of [sqlPath,testPath]) await withFixture({},async f=>{
    await f.put(file,(await readFile(path.join(f.root,file),'utf8'))+'\n-- changed');
    await assert.rejects(verifySupabasePermissionRelease(f),/does not match every changed migration|Isolation test source differs/);
  });
});
test('release gate: historical deletion and unknown baseline hashes fail closed',async()=>{
  for(const edit of [f=>{f.baseline.migration_sha256['supabase/migrations/20000101000000_missing.sql']='a'.repeat(64);},f=>{f.baseline.migration_sha256[sqlPath]='invalid';}]) await withFixture({},async f=>{
    edit(f);await f.putJson('config/kora-permission-baseline.json',f.baseline);await assert.rejects(verifySupabasePermissionRelease(f),/Historical migration removed|Invalid baseline entry/);
  });
});
test('release gate: the rebuild scenario and every artifact hash are mandatory',async()=>{
  for(const edit of [f=>delete f.evidence.rebuild,f=>{f.evidence.rebuild.after.sha256='b'.repeat(64);},f=>{f.evidence.upgrade.before.sha256='';}]) await withFixture({},async f=>{
    edit(f);await f.putJson('config/kora-permission-release.json',f.evidence);await assert.rejects(verifySupabasePermissionRelease(f),/Both isolated|Evidence changed|Pinned evidence/);
  });
});
test('release gate: actual missing table GRANT, disabled RLS or extra anonymous access blocks release',async()=>{
  for(const edit of [r=>r.grants=[],r=>r.rls=false,r=>r.grants.push({grantee:'anon',privilege:'SELECT',grantor:'postgres',grantable:false})]) await withFixture({},async f=>{
    edit(f.data.rebuild.after.relations[0]);await f.save();await assert.rejects(verifySupabasePermissionRelease(f),/rebuild: /);
  });
});
test('release gate: recreated objects cannot disappear from the explicit SQL inventory',async()=>withFixture({},async f=>{
  const r=object();f.data.upgrade.before.relations=[r];f.data.upgrade.created=[];await f.save();
  await assert.rejects(verifySupabasePermissionRelease(f),/Created\/recreated SQL object omitted/);
}));
test('release gate: exact function overload coverage is conservative and never guessed from a name',async()=>withFixture({},async f=>{
  const changed=source+' create or replace function public.fixture_fn(p integer) returns integer language sql as $$select p$$;';
  await f.put(sqlPath,changed);f.evidence.migration_sha256[sqlPath]=hash(changed);
  const fn={schema:'public',name:'fixture_fn',kind:'function',identity:'p integer',owner:'postgres',security_definer:false,config:[],grants:[],definition_md5:'a'.repeat(32)};
  for(const scenario of ['upgrade','rebuild']) {f.data[scenario].after.functions=[fn];f.data[scenario].contract.objects.push({...fn,justification:'Synthetic invoker',isolation_test:testPath});}
  await f.save();await assert.rejects(verifySupabasePermissionRelease(f),/Created\/recreated SQL object omitted/);
  for(const scenario of ['upgrade','rebuild'])f.data[scenario].created.push({schema:'public',name:'fixture_fn',kind:'function',identity:'p integer'});
  await f.save();assert.equal((await verifySupabasePermissionRelease(f)).ok,true);
}));
test('release gate: every contract links to a pinned test included by the actual local test runner',async()=>withFixture({},async f=>{
  f.data.upgrade.contract.objects[0].isolation_test='tests/not-in-suite.mjs';await f.save();
  await assert.rejects(verifySupabasePermissionRelease(f),/Every permission contract/);
}));
test('release gate: missing test discovery and cross-project contracts are rejected',async()=>{
  await withFixture({},async f=>{await f.put('scripts/run-kora-local-tests.mjs','// changed runner');await assert.rejects(verifySupabasePermissionRelease(f),/runner fingerprint differs|discovery changed/);});
  await withFixture({},async f=>{f.data.rebuild.contract.project='aura';await f.save();await assert.rejects(verifySupabasePermissionRelease(f),/another project/);});
});
test('release gate: evidence paths cannot traverse or follow symlinks outside the checkout',async()=>{
  await withFixture({},async f=>{f.evidence.upgrade.before.path='../outside.json';await f.putJson('config/kora-permission-release.json',f.evidence);await assert.rejects(verifySupabasePermissionRelease(f),/repository-relative/);});
  await withFixture({},async f=>{
    const file='tests/fixtures/gate/outside.json';await symlink(os.tmpdir(),path.join(f.root,file));f.evidence.upgrade.before.path=file;
    await f.putJson('config/kora-permission-release.json',f.evidence);await assert.rejects(verifySupabasePermissionRelease(f),/symlink escapes/);
  });
});
test('release gate: production pipeline awaits the semantic control before upload or promotion',async()=>{
  const pipeline=await readFile('scripts/deploy-kora-production.mjs','utf8');
  const call=pipeline.indexOf('await verifySupabasePermissionRelease({ root });');
  assert.ok(call>pipeline.indexOf("capture('git', ['status', '--porcelain'])"));
  for(const step of ["run('npm', ['run', 'test:local'])","run('npm', ['run', 'build'])","const upload =",'const promote ='])assert.ok(call<pipeline.indexOf(step),step);
  assert.equal(pipeline.match(/await verifySupabasePermissionRelease\(/g).length,1);
});

test('release gate: new SQL under historical-named subfolders cannot evade source monitoring',async()=>{
  for(const folder of ['rollback','fixtures','archive','backup']) await withFixture({unchanged:true,withEvidence:false},async f=>{
    await f.put('supabase/migrations/'+folder+'/synthetic.sql','create table public.unreviewed_fixture(id int);');
    await assert.rejects(verifySupabasePermissionRelease(f),/reviewed upgrade\/rebuild permission evidence/);
  });
});

// Release preflight, offline only. Does not run SQL or replace code review.
import { readFile, readdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { checkPermissionContract } from './check-permission-contract.mjs';
import { sqlStatements, createdObjects } from './sql-statements.mjs';

const roots = ['supabase/migrations', 'creditek/erp/migrations'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const equal = (a,b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
const safePath = value => typeof value === 'string' && value.length > 0 && !path.isAbsolute(value) && !value.includes('\\') && value.split('/').every(p => p && p !== '.' && p !== '..');
async function localFile(root, file) {
  if (!safePath(file)) throw Error('Evidence must use a repository-relative path');
  const resolved = await realpath(path.join(root,file));
  if (!resolved.startsWith(root + path.sep)) throw Error('Evidence symlink escapes the checkout');
  return readFile(resolved);
}
async function json(root,file) { return JSON.parse(await localFile(root,file)); }
async function pinned(root, item) {
  if (!item || !/^[a-f0-9]{64}$/.test(item.sha256 || '')) throw Error('Pinned evidence SHA-256 required');
  const body=await localFile(root,item.path);
  if(sha(body)!==item.sha256) throw Error('Evidence changed after review: '+item.path);
  return JSON.parse(body);
}
async function migrationFiles(root, folder) {
  let entries;
  try { entries=await readdir(path.join(root,folder),{withFileTypes:true}); }
  catch(e) { if(e.code==='ENOENT')return []; throw e; }
  const files=[];
  for(const e of entries) {
    if(e.isSymbolicLink())throw Error('Migration symlinks require separate review: '+folder+'/'+e.name);
    // Monitor every SQL source under migration roots, including historical
    // subfolders. Discovery here is never authorization to replay those files.
    if(e.isDirectory()) files.push(...await migrationFiles(root,folder+'/'+e.name));
    else if(e.name.endsWith('.sql') && (e.isFile() || e.isSymbolicLink())) files.push(folder+'/'+e.name);
  }
  return files.sort();
}
const key = o => `${o.schema}.${o.name}${o.identity === undefined ? '' : '('+o.identity+')'}`;
const definitionKind = kind => ({table:['r','p'],view:['v'],'materialized view':['m'],sequence:['S'],function:['function'],procedure:['function']})[kind] || [];

// Preserve and actively verify earlier native proof when a combined later release supersedes its contract.
export async function verifyPriorNativeEvidence({root,ref,release}) {
  root=await realpath(root);
  const prior=await pinned(root,ref);
  if(prior.prior_native_release || prior.project!=='kora' || prior.schema_version!==1 || !prior.native_result)throw Error('Invalid prior native release');
  const native=await pinned(root,prior.native_result);
  if(native.complete!==true || !Array.isArray(native.checks) || !native.checks.length || native.checks.some(c=>c.passed!==true)
    || native.production_operations!==0 || native.external_sends!==0)throw Error('Prior native run is incomplete or unsafe');
  if(prior.test_runner_sha256!==sha(await localFile(root,'scripts/run-kora-local-tests.mjs')))throw Error('Prior native runner changed');
  for(const [file,hash] of Object.entries(prior.migration_sha256 || {})) {
    if(release.migration_sha256?.[file]!==hash || sha(await localFile(root,file))!==hash)throw Error('Prior native SQL pin changed');
  }
  for(const test of prior.isolation_tests || []) {
    if(!release.isolation_tests?.some(t=>t.path===test.path&&t.sha256===test.sha256) || sha(await localFile(root,test.path))!==test.sha256)throw Error('Prior native isolation test omitted or changed');
  }
  for(const delta of prior.additional_releases || [])if(!release.additional_releases?.some(r=>r.path===delta.path&&r.sha256===delta.sha256))throw Error('Prior native additional release omitted');
  for(const scenario of ['upgrade','rebuild']) {
    const b=prior[scenario];if(!b)throw Error('Prior native scenario omitted');
    const [before,after,contract,created]=await Promise.all(['before','after','contract','created'].map(k=>pinned(root,b[k])));
    const result=checkPermissionContract({before,after,contract,created});
    if(!result.ok)throw Error('Prior native '+scenario+': '+result.errors.join('; '));
  }
  return {ok:true,native_checks:native.checks.length};
}

export async function verifySupabasePermissionRelease({root}) {
  root=await realpath(root);
  const baseline=await json(root,'config/kora-permission-baseline.json');
  if(baseline.schema_version!==1 || baseline.project!=='kora' || !/^[a-f0-9]{40}$/.test(baseline.baseline_commit || '') || !baseline.migration_sha256 || Array.isArray(baseline.migration_sha256)) throw Error('Reviewed KORA permission baseline required');
  const files=(await Promise.all(roots.map(r=>migrationFiles(root,r)))).flat().sort();
  const hashes={}, sources=new Map();
  for(const file of files) { const body=await localFile(root,file);hashes[file]=sha(body);sources.set(file,body.toString('utf8')); }
  for(const [file,hash] of Object.entries(baseline.migration_sha256)) {
    if(!safePath(file) || !roots.some(r=>file.startsWith(r+'/')) || !/^[a-f0-9]{64}$/.test(hash)) throw Error('Invalid baseline entry');
    if(!hashes[file])throw Error('Historical migration removed; separate review required: '+file);
  }
  const changed=Object.fromEntries(Object.entries(hashes).filter(([file,hash])=>baseline.migration_sha256[file]!==hash));
  if(!Object.keys(changed).length) return {ok:true,scope:'no-migration-source-changes',checked_files:files.length};
  let evidence;
  try { evidence=await json(root,'config/kora-permission-release.json'); }
  catch(e) { if(e.code==='ENOENT')throw Error('SQL changed: reviewed upgrade/rebuild permission evidence is required before publication');throw e; }
  // Independent reviewed deltas retain their own isolated catalogs. Never merge
  // catalogs from separate databases or weaken coverage of the older batch.
  if(evidence.prior_native_release)await verifyPriorNativeEvidence({root,ref:evidence.prior_native_release,release:evidence});
  const releases=[{ref:{path:'config/kora-permission-release.json'},evidence}];
  if(evidence.additional_releases!==undefined && !Array.isArray(evidence.additional_releases))throw Error('Additional releases must be pinned evidence');
  for(const ref of evidence.additional_releases || []) {
    const extra=await pinned(root,ref);
    if(extra.additional_releases!==undefined)throw Error('Nested release evidence is not supported');
    releases.push({ref,evidence:extra});
  }
  const byPath=new Map(releases.map(x=>[x.ref.path,x]));
  if(byPath.size!==releases.length)throw Error('Duplicate release evidence path');
  const supersedes=(later,earlier)=>Array.isArray(later.evidence.supersedes)&&later.evidence.supersedes.some(x=>x.path===earlier.ref.path&&x.sha256===earlier.ref.sha256);
  for(const item of releases) {
    if(item.evidence.supersedes!==undefined&&!Array.isArray(item.evidence.supersedes))throw Error('Invalid superseded evidence');
    for(const ref of item.evidence.supersedes||[]) {
      const old=byPath.get(ref.path);
      if(!old||old===item||old.ref.sha256!==ref.sha256||releases.indexOf(old)>=releases.indexOf(item)||old.evidence.supersedes?.length)throw Error('Superseded release must be an earlier pinned independent release');
      for(const [file,hash] of Object.entries(old.evidence.migration_sha256||{}))if(item.evidence.migration_sha256?.[file]!==hash)throw Error('Combined release omitted superseded migration');
    }
  }
  const covered={},coverageOwner=new Map();
  for(const item of releases) {
    const release=item.evidence;
    if(release.schema_version!==1 || release.project!=='kora' || !release.migration_sha256 || Array.isArray(release.migration_sha256) || !Object.keys(release.migration_sha256).length)throw Error('Invalid permission release evidence');
    for(const [file,hash] of Object.entries(release.migration_sha256)) {
      if(Object.hasOwn(covered,file)&&(!supersedes(item,coverageOwner.get(file))||covered[file]!==hash))throw Error('Migration covered by multiple releases');
      covered[file]=hash;
      coverageOwner.set(file,item);
    }
  }
  if(!equal(changed,covered))throw Error('Permission evidence does not match every changed migration');
  const checked=[],contracted=new Map();
  const contractKeys=new Map();
  for(const item of releases) {
  const evidence=item.evidence;
  if(!Array.isArray(evidence.isolation_tests) || !evidence.isolation_tests.length) throw Error('Negative/isolation test sources are required');
  const testPaths = new Set();
  for(const item of evidence.isolation_tests) {
    if(!/^tests\/security\/supabase-compatibility[^/]*\.test\.mjs$/.test(item.path || '') || testPaths.has(item.path))throw Error('Isolation tests must be distinct sources included in test:local');
    const body=await localFile(root,item.path);
    if(!/^[a-f0-9]{64}$/.test(item.sha256 || '') || sha(body)!==item.sha256)throw Error('Isolation test source differs from reviewed evidence');
    testPaths.add(item.path);
  }
  const runner=(await localFile(root,'scripts/run-kora-local-tests.mjs')).toString('utf8');
  // Guard the existing test:local discovery rather than silently accepting a
  // source that the real pipeline would never execute.
  if(!/^[a-f0-9]{64}$/.test(evidence.test_runner_sha256 || '') || sha(runner)!==evidence.test_runner_sha256)throw Error('Reviewed test runner fingerprint differs');
  if(!runner.includes("readdirSync('tests/security')") || !runner.includes("name.endsWith('.test.mjs')"))throw Error('test:local discovery changed; review the permission gate integration');
  const declarations=Object.keys(evidence.migration_sha256).flatMap(file=>createdObjects(sqlStatements(sources.get(file))).map(o=>({...o,file})));
  for(const scenario of ['upgrade','rebuild']) {
    const bundle=evidence[scenario];
    if(!bundle)throw Error('Both isolated upgrade and rebuild scenarios are required');
    const [before,after,contract,created]=await Promise.all(['before','after','contract','created'].map(k=>pinned(root,bundle[k])));
    if(contract.project!=='kora')throw Error('Catalog contract belongs to another project');
    if(!Array.isArray(contract.objects) || contract.objects.some(o=>!testPaths.has(o.isolation_test)))throw Error('Every permission contract must name a pinned isolation test');
    if(!Array.isArray(created))throw Error('Created/recreated inventory must be explicit');
    for(const o of contract.objects) {
      const objectKey=scenario+':'+key(o);
      if(contracted.has(objectKey)&&!supersedes(item,contracted.get(objectKey)))throw Error('Overlapping release objects require a combined isolated run: '+key(o));
      contracted.set(objectKey,item);
      if(!contractKeys.has(item.ref.path))contractKeys.set(item.ref.path,new Set());
      contractKeys.get(item.ref.path).add(objectKey);
    }
    const objects=[...after.relations,...after.functions.map(f=>({...f,kind:'function'}))];
    for(const declaration of declarations) {
      if(!declaration.schema)throw Error('Unqualified created object requires manual resolution: '+declaration.file);
      const actual=objects.filter(o=>o.schema===declaration.schema&&o.name===declaration.name&&definitionKind(declaration.kind).includes(o.kind));
      // Function signatures are resolved conservatively: every matching overload
      // must be covered. A SQL text heuristic is never authorization to guess.
      if(!actual.length || actual.some(o=>!created.some(c=>key(c)===key(o))))throw Error('Created/recreated SQL object omitted from isolated inventory: '+declaration.schema+'.'+declaration.name);
    }
    const result=checkPermissionContract({before,after,contract,created});
    if(!result.ok)throw Error(scenario+': '+result.errors.join('; '));
    checked.push({scenario,checked_objects:result.checked_objects});
  }
  }
  for(const item of releases)for(const ref of item.evidence.supersedes||[])for(const objectKey of contractKeys.get(ref.path)||[])if(!contractKeys.get(item.ref.path)?.has(objectKey))throw Error('Combined release omitted superseded object: '+objectKey);
  return {ok:true,scope:'offline-release-permission-contract-only',changed_files:Object.keys(changed),checked,
    limitations:['Code review and full business/negative tests still required.','No production access was granted or database operation performed.','The historical hash baseline is not a full schema reconstruction certification.']};
}

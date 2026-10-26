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
  if(evidence.schema_version!==1 || evidence.project!=='kora' || !equal(changed,evidence.migration_sha256 || {})) throw Error('Permission evidence does not match every changed migration');
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
  const declarations=Object.keys(changed).flatMap(file=>createdObjects(sqlStatements(sources.get(file))).map(o=>({...o,file})));
  const checked=[];
  for(const scenario of ['upgrade','rebuild']) {
    const bundle=evidence[scenario];
    if(!bundle)throw Error('Both isolated upgrade and rebuild scenarios are required');
    const [before,after,contract,created]=await Promise.all(['before','after','contract','created'].map(k=>pinned(root,bundle[k])));
    if(contract.project!=='kora')throw Error('Catalog contract belongs to another project');
    if(!Array.isArray(contract.objects) || contract.objects.some(o=>!testPaths.has(o.isolation_test)))throw Error('Every permission contract must name a pinned isolation test');
    if(!Array.isArray(created))throw Error('Created/recreated inventory must be explicit');
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
  return {ok:true,scope:'offline-release-permission-contract-only',changed_files:Object.keys(changed),checked,
    limitations:['Code review and full business/negative tests still required.','No production access was granted or database operation performed.','The historical hash baseline is not a full schema reconstruction certification.']};
}

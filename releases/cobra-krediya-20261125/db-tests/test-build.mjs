// Review staging only: no integration into active sources, no Git or deployment.
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildPublic } from '../../../scripts/build-public.mjs';
import { verifyPublicArtifact } from '../../../scripts/verify-public-artifact.mjs';
import { buildKora } from '../../../scripts/build-kora.mjs';
import { verifyKoraArtifact } from '../../../scripts/verify-kora-artifact.mjs';

const release=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.resolve(release,'../..'),out=path.resolve(process.argv[2]);
assert.notEqual(out,repo);assert.ok(!out.startsWith(repo+path.sep),'Keep staging outside active repository');
const stage=path.join(out,'creditek-kora-review-'+randomUUID());
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(await readFile(path.join(release,'integration/source-manifest.json'),'utf8'));
const checks=[];
await mkdir(stage,{recursive:true});
async function copy(relative){await mkdir(path.dirname(path.join(stage,relative)),{recursive:true});await cp(path.join(repo,relative),path.join(stage,relative),{recursive:true});}
try {
  async function assertBaseline(read=readFile){
    const replaced=Object.values(manifest.sources).map(x=>x.target).filter(x=>Object.hasOwn(manifest.baseline,x));
    assert.deepEqual(replaced.sort(),Object.keys(manifest.baseline).sort(),'Every baseline must be used by a replacement');
    for(const target of replaced)assert.equal(hash(await read(path.join(repo,target))),manifest.baseline[target],'Rebase candidate: active source changed: '+target);
  }
  await assertBaseline();checks.push('replacement source baselines match before any candidate is copied');
  const changedTarget=Object.keys(manifest.baseline)[0];
  await assert.rejects(assertBaseline(async file=>file===path.join(repo,changedTarget)?Buffer.from('fictional concurrent source change'):readFile(file)),/Rebase candidate/);
  checks.push('a simulated concurrent source change is rejected before replacement');
  for(const file of ['index.html','creditek/convenios/index.html','creditek/legal/index.html','creditek/portal/index.html','config/production-endpoints.js','config/kora-environment.js','config/generated/kora-environment.generated.js','config/version.json','creditek/shared/branding/creditek-logo.png'])await copy(file);
  for(const directory of ['creditek/agentes','creditek/assets','creditek/data','design-system','creditek/erp/vendor'])await copy(directory);
  const original={};
  for(const name of await readdir(path.join(repo,'creditek/erp'))){
    const relative='creditek/erp/'+name,info=await stat(path.join(repo,relative));
    if(info.isFile()&&(/\.(html|js|css)$/.test(name)||/^kora-(?:icon-.*\.png|webmanifest)$/.test(name)||name==='kora.webmanifest')){await copy(relative);original[relative]=hash(await readFile(path.join(repo,relative)));}
  }
  for(const [source,item] of Object.entries(manifest.sources)){
    const data=await readFile(path.join(release,source));assert.equal(hash(data),item.sha256);
    assert.ok(item.target.startsWith('creditek/erp/')&&!item.target.includes('..'));
    await mkdir(path.dirname(path.join(stage,item.target)),{recursive:true});await writeFile(path.join(stage,item.target),data);
  }
  await buildPublic(stage,path.join(stage,'public'));await verifyPublicArtifact(path.join(stage,'public'));checks.push('official public builder and private-file verifier accept the staged candidate');
  const artifact=await buildKora(stage);await verifyKoraArtifact(artifact);checks.push('official KORA builder resolves every staged HTML asset reference');
  for(const [source,item] of Object.entries(manifest.sources)){
    const data=await readFile(path.join(artifact,item.target));
    if(!item.target.endsWith('.html'))assert.equal(hash(data),item.sha256,item.target);
    else {const html=data.toString();for(const target of Object.values(manifest.sources).map(x=>x.target).filter(x=>/cobra-krediya.*\.(js|css)$/.test(x)))assert.ok(html.includes('/'+target),target);}
  }
  checks.push('every proposed browser asset and the vendor license are present; generated HTML versions are preserved');
  for(const [relative,before] of Object.entries(original))assert.equal(hash(await readFile(path.join(repo,relative))),before,relative);
  checks.push('active ERP source files remain byte-identical after the staged build');
  const scripts={};for(const file of ['build-public.mjs','verify-public-artifact.mjs','build-kora.mjs','verify-kora-artifact.mjs'])scripts[file]=hash(await readFile(path.join(repo,'scripts',file)));
  const result={ok:true,passed:checks.length,checks,stage,artifact,manifest_sha256:hash(await readFile(path.join(release,'integration/source-manifest.json'))),official_script_sha256:scripts,source_integration:false,production_changes:false,scope:'Official artifact construction in a separate copy; no deploy, SQL application, managed-session or complete release-pipeline certification.'};
  await writeFile(path.join(out,'build-result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({ok:true,passed:checks.length,artifact}));
} catch(error){await writeFile(path.join(out,'build-failure.json'),JSON.stringify({ok:false,stage,error:error.message,production_changes:false},null,2)+'\n');throw error;}

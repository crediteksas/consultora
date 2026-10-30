import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {transformRoute,BASELINE_SHA256,FORM_SHA256,sha} from './route-transform.mjs';
const root=new URL('./',import.meta.url),get=file=>readFile(new URL(file,root),'utf8');
const baseline=await get('baseline/index.mjs'),form=await get('baseline/form.html');
assert.equal(sha(form),FORM_SHA256);
const candidate=transformRoute(baseline);
await mkdir(new URL('deploy/',root),{recursive:true});
await writeFile(new URL('deploy/index.mjs',root),candidate);
await writeFile(new URL('deploy/form.html',root),form);
const diff=spawnSync('git',['diff','--no-index','--','baseline/index.mjs','deploy/index.mjs'],{cwd:fileURLToPath(root),encoding:'utf8'});
assert.equal(diff.status,1);await writeFile(new URL('candidate.diff',root),diff.stdout);
const manifest={status:'LOCAL_CANDIDATE_REVIEW_REQUIRED',baseline:{workerSha256:BASELINE_SHA256,formSha256:FORM_SHA256},
 candidate:{workerSha256:sha(candidate),workerBytes:Buffer.byteLength(candidate),formSha256:sha(form),formBytes:Buffer.byteLength(form)},changedFunctions:['handleOtpEnviarRoute2'],
 changedLines:1,formUnchanged:true,sqlChanges:false,otherWorkersChanged:false,productionWrites:0,realMessages:0,config:'Root supplies configuration copied from current production; no configuration is synthesized by this build.'};
await writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2));


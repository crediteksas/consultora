import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {transformDiagnostic,BASELINE_SHA256,FORM_SHA256,sha} from './transform.mjs';
const root=new URL('./',import.meta.url),source=await readFile(new URL('baseline/index.mjs',root),'utf8'),form=await readFile(new URL('baseline/form.html',root),'utf8');
assert.equal(sha(form),FORM_SHA256);const candidate=transformDiagnostic(source);
await mkdir(new URL('deploy/',root),{recursive:true});await writeFile(new URL('deploy/index.mjs',root),candidate);await writeFile(new URL('deploy/form.html',root),form);
const r=spawnSync('git',['diff','--no-index','--','baseline/index.mjs','deploy/index.mjs'],{cwd:fileURLToPath(root),encoding:'utf8'});assert.equal(r.status,1);await writeFile(new URL('candidate.diff',root),r.stdout);
const manifest={status:'LOCAL_RPC_FIX_REVIEW_REQUIRED',baselineWorkerSha256:BASELINE_SHA256,candidateWorkerSha256:sha(candidate),formSha256:FORM_SHA256,formUnchanged:true,changedFunctions:['rpc','novaActiveOtp2','smsOtpDependencies'],publicResponseContractChanged:false,validationOrPermissionsChanged:false,sqlChanges:false,otherWorkersChanged:false,privateLogsAdded:false,productionWrites:0,realMessages:0};
await writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2));


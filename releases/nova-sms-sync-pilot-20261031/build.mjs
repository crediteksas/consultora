import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {transformBundle,BASELINE_WORKER_SHA256,BASELINE_FORM_SHA256,sha} from './transform.mjs';
const root=new URL('./',import.meta.url),baseline=new URL('../nova-otp-delivery-20261031/deploy/clientes/',root),output=new URL('deploy/clientes/',root);
const source=await readFile(new URL('index.mjs',baseline),'utf8'),form=await readFile(new URL('form.html',baseline),'utf8');
const next=transformBundle(source,form);await mkdir(output,{recursive:true});
await writeFile(new URL('index.mjs',output),next.worker);await writeFile(new URL('form.html',output),next.form);
let diff='';for(const name of ['index.mjs','form.html']){const r=spawnSync('git',['diff','--no-index','--',fileURLToPath(new URL(name,baseline)),fileURLToPath(new URL(name,output))],{encoding:'utf8'});assert.equal(r.status,1);diff+=r.stdout;}
await writeFile(new URL('candidate.diff',root),diff);
const manifest={status:'LOCAL_REVIEW_REQUIRED_NO_ACTIVATION',baselineWorkerSha256:BASELINE_WORKER_SHA256,baselineFormSha256:BASELINE_FORM_SHA256,candidateWorkerSha256:sha(next.worker),candidateFormSha256:sha(next.form),changedFunctions:['sendPreparedExpressSms','solicitarOtpGestionado'],providerTimeoutMs:{before:8000,after:30000},uiSendTimeoutMs:{smsBefore:20000,smsAfter:90000,whatsappBefore:20000,whatsappAfter:20000},embeddedMatchesExternal:true,asyncModeChanged:false,responseParserChanged:false,sqlChanges:false,bindingOrSecretChanges:false,otpTtlMs:300000,policyActivation:false,automaticRetries:false,realMessages:0,realProviderRequests:0,productionWrites:0};
await writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2));

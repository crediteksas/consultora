import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {transformForm} from './ui/transform.mjs';
import {transformClient,transformNova,CLIENT_BASE,NOVA_BASE,sha} from './transform.mjs';
const root=new URL('./',import.meta.url),read=n=>fs.readFile(new URL(n,root),'utf8');
const form=transformForm(await read('baseline/clientes/form.html'));
const clients=transformClient(await read('baseline/clientes/index.mjs'),form),nova=transformNova(await read('baseline/nova/index.mjs'));
for(const [name,data]of[['clientes/index.mjs',clients],['clientes/form.html',form],['nova/index.mjs',nova]]){await fs.mkdir(new URL('deploy/'+name.slice(0,name.lastIndexOf('/'))+'/',root),{recursive:true});await fs.writeFile(new URL('deploy/'+name,root),data);}
const manifests={clientes:{baseline:CLIENT_BASE,candidate:sha(clients),form:sha(form)},nova:{baseline:NOVA_BASE,candidate:sha(nova)}};
await fs.writeFile(new URL('manifest.json',root),JSON.stringify({status:'LOCAL_REVIEW_REQUIRED',workers:manifests,sql:'Additive immutable OTP/wamid receipts +3invokerRPC +verification guard',smsPolicyChange:false,smsTransportChange:false,autoResends:false,realMessages:0},null,2)+'\n');
for(const worker of ['clientes','nova']){const r=spawnSync('git',['diff','--no-index','--','baseline/'+worker+'/index.mjs','deploy/'+worker+'/index.mjs'],{cwd:fileURLToPath(root),encoding:'utf8',maxBuffer:10000000});if(r.status!==1)throw Error('DIFF_FAILED');await fs.writeFile(new URL(worker+'.diff',root),r.stdout);}
console.log(JSON.stringify(manifests));

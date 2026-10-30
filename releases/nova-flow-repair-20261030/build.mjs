import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import {transformClientesOtp} from './clientes/otp-transform.mjs';
import {transformForm} from './clientes/ui-transform.mjs';
import {transformNova as referenceRepair} from './referencias/transform.mjs';
import {transformNova as platformRepair,transformClientes as gatewayRepair} from './plataformas/transform.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(root,'../..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const write=(p,s)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s);};
function embeddedForm(source){
 const prefix='var pilot_form_default = ',start=source.indexOf(prefix);
 assert.ok(start>=0&&source.indexOf(prefix,start+prefix.length)<0,'Embedded form declaration drift');
 const from=start+prefix.length,quote=source[from];assert.ok(['"',"'",'`'].includes(quote),'Expected form literal');
 for(let i=from+1;i<source.length;i++){
  if(source[i]==='\\'){i++;continue;}
  if(source[i]===quote){assert.equal(source[i+1],';');return {declaration:source.slice(start,i+2),literal:source.slice(from,i+1)};}
 }
 throw Error('Unclosed embedded form');
}
const baselines={
 'clientes/index.mjs':'9a9c81c37a504c12be12b9fcc9a681be7209d9556367d1bb2f517936640d56e1',
 'clientes/form.html':'0f95fd3046df2e74b607a6f5dd9182c02048a5571e26a2689e73d72e61379c2e',
 'nova/index.mjs':'232513ce40c043e43c530ebad9bb9b3dbfc7d8061cae109f07fd82f841c411fb',
};
for(const [file,hash]of Object.entries(baselines))assert.equal(sha(read('baseline/'+file)),hash,'Production baseline changed: '+file);
const form=transformForm(read('baseline/clientes/form.html'));
let clients=gatewayRepair(transformClientesOtp(read('baseline/clientes/index.mjs')));
const embedded=embeddedForm(clients);
assert.equal(vm.runInNewContext(embedded.literal,Object.create(null),{timeout:1000}),read('baseline/clientes/form.html'),'Embedded production form differs from external module');
clients=clients.replace(embedded.declaration,'var pilot_form_default = '+JSON.stringify(form)+';');
const nova=platformRepair(referenceRepair(read('baseline/nova/index.mjs')));
assert.equal(vm.runInNewContext(embeddedForm(clients).literal,Object.create(null),{timeout:1000}),form);
write('deploy/clientes/index.mjs',clients);write('deploy/clientes/form.html',form);write('deploy/nova/index.mjs',nova);

const configs={};
for(const name of ['clientes','nova']){
 const cfg=JSON.parse(read('wrangler.'+name+'.jsonc')),meta=JSON.parse(read('baseline/'+name+'/metadata.json'));
 assert.equal(cfg.name,'creditek-'+name);assert.equal(cfg.no_bundle,true);assert.equal(cfg.keep_vars,true);
 assert.equal(cfg.main,'deploy/'+name+'/index.mjs');assert.equal(cfg.base_dir,'deploy/'+name);
 assert.deepEqual(cfg.triggers.crons,meta.crons);assert.deepEqual(cfg.routes,meta.routes);
 assert.equal(cfg.compatibility_date,meta.settings.compatibility_date);assert.deepEqual(cfg.compatibility_flags,meta.settings.compatibility_flags);
 const names=[...Object.keys(cfg.vars),...(cfg.services||[]).map(b=>b.binding),...(cfg.kv_namespaces||[]).map(b=>b.binding),...(cfg.hyperdrive||[]).map(b=>b.binding),...(cfg.durable_objects?.bindings||[]).map(b=>b.name),...(cfg.ratelimits||[]).map(b=>b.name),...(cfg.ai?[cfg.ai.binding]:[])].sort();
 assert.deepEqual(names,meta.bindings.filter(b=>b.type!=='secret_text').map(b=>b.name).sort(),'Binding names changed');
 for(const b of meta.bindings.filter(b=>b.type==='plain_text'))assert.equal(cfg.vars[b.name],b.text,'Runtime flag changed: '+b.name);
 if(name==='clientes')assert.equal(cfg.vars.NOVA_SMS_ENABLED,'false');
 configs[name]={sha256:sha(read('wrangler.'+name+'.jsonc')),bindingsPreserved:meta.bindings.length,secretNamesPreserved:meta.bindings.filter(b=>b.type==='secret_text').map(b=>b.name),crons:cfg.triggers.crons,routes:cfg.routes};
}
const migrations=[
 {project:'jfkmiyvcdfbsbwchyvol',file:'supabase/migrations/20261030213906_nova_otp_active_challenge_guard.sql'},
 {project:'jfkmiyvcdfbsbwchyvol',file:'supabase/migrations/20261030213910_nova_retail_consent_and_query_recovery.sql'},
 {project:'ditiwpndvmyuqcagupea',file:'releases/nova-flow-repair-20261030/aura/supabase/migrations/20261030213851_nova_reference_order_and_uncertainty.sql'},
].map(m=>({...m,sha256:sha(fs.readFileSync(path.join(repo,m.file)))}));
for(const m of migrations)assert.ok(fs.statSync(path.join(repo,m.file)).size>300,'Empty migration');

// Review diffs omit ONLY the enormous duplicated embedded form literal. The
// complete real candidate and separate form remain available and hash-pinned.
const normalize=s=>s.replace(embeddedForm(s).declaration,'var pilot_form_default = "See standalone hash-pinned form.html";');
write('review/base-clientes.mjs',normalize(read('baseline/clientes/index.mjs')));write('review/candidate-clientes.mjs',normalize(clients));
for(const [name,base,target]of[['clientes','review/base-clientes.mjs','review/candidate-clientes.mjs'],['nova','baseline/nova/index.mjs','deploy/nova/index.mjs'],['form','baseline/clientes/form.html','deploy/clientes/form.html']]){
 const result=spawnSync('git',['diff','--no-index','--',path.join(root,base),path.join(root,target)],{encoding:'utf8',maxBuffer:5*1024*1024});
 assert.ok(result.status===0||result.status===1,result.stderr);write('review/'+name+'.diff',result.stdout);
}
const manifest={status:'LOCAL_CANDIDATE_NOT_PUBLISHED',baselines,artifacts:Object.fromEntries(['clientes/index.mjs','clientes/form.html','nova/index.mjs'].map(p=>[p,{bytes:Buffer.byteLength(read('deploy/'+p)),sha256:sha(read('deploy/'+p))}])),configs,migrations,findings:['FOTO-01','FOTO-02','OTP-01','OTP-02','OTP-03','REF-01','REF-02','CONS-01','CONSULTA-01','SMS-01'],smsEnabled:false,customerMessagesSent:0,productionWrites:0};
write('manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({build:'PASS',artifacts:manifest.artifacts,migrations:migrations.map(m=>({project:m.project,sha256:m.sha256})),smsEnabled:false}));

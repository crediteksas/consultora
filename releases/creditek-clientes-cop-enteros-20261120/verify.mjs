import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=pathToFileURL(path.resolve(process.argv[3]||'/tmp/kora-cop-20261120')+'/'),stage=process.argv[2]||'preflight';
assert.ok(['payload','preflight','candidate','postflight'].includes(stage));
const base=JSON.parse(await fs.readFile(new URL('baseline.json',root),'utf8'));
const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(stage==='payload'){
  const bytes=await fs.readFile(new URL('upload.multipart',root)),boundary=bytes.toString().split('\r\n')[0].slice(2);
  const form=await new Response(bytes,{headers:{'content-type':'multipart/form-data; boundary='+boundary}}).formData();
  const metadata=JSON.parse(form.get('metadata'));
  const config=JSON.parse(await fs.readFile(new URL('wrangler.json',root),'utf8'));
  const expected={main_module:'index.mjs',bindings:[],annotations:{},...config.unsafe.metadata};
  assert.deepEqual(metadata,expected,'Unexpected upload metadata');
  assert.deepEqual(metadata.keep_bindings,manifest.preservedBindingTypes);assert.deepEqual(metadata.bindings,[]);
  assert.equal(metadata.compatibility_date,base.settings.compatibility_date);assert.deepEqual(metadata.compatibility_flags,base.settings.compatibility_flags);
  assert.equal(sha(Buffer.from(await form.get(metadata.main_module).arrayBuffer())),manifest.candidateSha256);
  assert.equal(sha(Buffer.from(await form.get('form.html').arrayBuffer())),manifest.unchangedFormSha256);
  assert.equal([...form.keys()].length,3);assert.equal(metadata.assets,undefined);assert.equal(metadata.migrations,undefined);
  console.log('PASS: exact modules and retained bindings; no assets or migrations');
}else{
  const token=(await fs.readFile(path.join(os.homedir(),'.wrangler/config/default.toml'),'utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)[1];
  const api='https://api.cloudflare.com/client/v4/accounts/853eee9e3d80f805fee58f4f99507e8a/workers',headers={authorization:'Bearer '+token},service='/services/creditek-clientes/environments/production',script='/scripts/creditek-clientes';
  async function read(path){const r=await fetch(api+path,{headers});assert.ok(r.ok);const j=await r.json();assert.ok(j.success);return j.result;}
  const res=await fetch(api+service+'/content',{headers});assert.ok(res.ok);const form=await res.formData();
  assert.deepEqual([...form.keys()].sort(),Object.keys(base.modules).sort());
  const hashes={};for(const [n,f] of form){const hash=sha(typeof f==='string'?f:Buffer.from(await f.arrayBuffer()));hashes[n]=hash;assert.equal(hash,stage==='postflight'&&n==='index.mjs'?manifest.candidateSha256:base.modules[n].sha256);}
  const settings=await read(service+'/settings');
  const normalize=bindings=>[...bindings].sort((a,b)=>a.name.localeCompare(b.name));
  assert.deepEqual(normalize(settings.bindings),normalize(base.settings.bindings),'Bindings or variables changed');
  const rest=value=>Object.fromEntries(Object.entries(value).filter(([k])=>!['bindings','annotations'].includes(k)));
  assert.deepEqual(rest(settings),rest(base.settings),'Configuration changed');
  assert.deepEqual(await read(script+'/schedules'),base.schedules,'Cron changed');
  assert.deepEqual(await read(script+'/subdomain'),base.subdomain,'Subdomain changed');
  const deployments=(await read(script+'/deployments')).deployments;
  assert.ok(deployments.length&&deployments.every(d=>Number.isFinite(Date.parse(d.created_on))));
  const versions=[...deployments].sort((a,b)=>Date.parse(b.created_on)-Date.parse(a.created_on))[0].versions;
  if(stage==='preflight'||stage==='candidate')assert.deepEqual(versions,manifest.baselineVersions,'Concurrent deployment');
  else{assert.equal(versions.length,1);assert.equal(versions[0].percentage,100);assert.equal(versions[0].version_id,(await fs.readFile(new URL('uploaded-version.txt',root),'utf8')).trim());}
  if(stage==='candidate'){
    const versionId=(await fs.readFile(new URL('uploaded-version.txt',root),'utf8')).trim();
    const version=await read(script+'/versions/'+encodeURIComponent(versionId));
    assert.equal(version.id,versionId);
    assert.deepEqual(normalize(version.resources.bindings),normalize(base.settings.bindings),'Uploaded version bindings changed');
  }
  const receipt={stage,checkedAt:new Date().toISOString(),status:'PASS',versions,hashes,bindingsPreserved:true,variablesPreserved:true,cronPreserved:true,subdomainPreserved:true};
  await fs.writeFile(new URL(stage+'-'+Date.now()+'-receipt.json',root),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}

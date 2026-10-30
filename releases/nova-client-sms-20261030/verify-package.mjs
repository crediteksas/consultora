import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('./',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root));
const json=p=>JSON.parse(read(p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const base=json('baseline-settings-sanitized.json'),config=json('wrangler.jsonc');
assert.equal(config.name,'creditek-clientes');
assert.equal(config.main,'deploy/index.mjs');
assert.equal(config.base_dir,'deploy');
assert.equal(config.keep_vars,true);
assert.equal(config.no_bundle,true);
assert.equal(config.vars.NOVA_SMS_ENABLED,'false');
assert.equal(config.compatibility_date,base.compatibility_date);
assert.deepEqual(config.compatibility_flags,base.compatibility_flags);
assert.deepEqual(config.triggers.crons,base.crons);
assert.deepEqual(config.tail_consumers,base.tail_consumers);
assert.equal(config.logpush,base.logpush);
for(const b of base.bindings){
  if(b.type==='secret_text'){assert.deepEqual(Object.keys(b).sort(),['name','type']);assert.ok(!(b.name in config.vars));}
  else if(b.type==='plain_text')assert.equal(config.vars[b.name],b.text,b.name);
  else if(b.type==='service')assert.deepEqual(config.services.find(s=>s.binding===b.name),{binding:b.name,service:b.service,environment:b.environment});
  else if(b.type==='ai')assert.equal(config.ai.binding,b.name);
  else if(b.type==='ratelimit')assert.deepEqual(config.ratelimits.find(r=>r.name===b.name),{name:b.name,namespace_id:b.namespace_id,simple:b.simple});
  else throw Error('Unknown baseline binding '+b.type);
}
assert.deepEqual(fs.readdirSync(new URL('./deploy/',root)).sort(),['form.html','index.mjs']);
for(const name of ['form.html','index.mjs'])assert.equal(sha(read(name)),sha(read('deploy/'+name)),name);
const manifest=json('manifest.json');
for(const [name,hash] of Object.entries(manifest.files))assert.equal(sha(read(name)),hash,name);
assert.equal(sha(fs.readFileSync(new URL('../../'+manifest.migration.path,root))),manifest.migration.sha256);
console.log(JSON.stringify({passed:true,files:Object.keys(manifest.files).length,priorBindingsPreserved:base.bindings.length,secretBindingsNamesOnly:base.bindings.filter(b=>b.type==='secret_text').length,cronsPreserved:base.crons.length,deployModules:['index.mjs','form.html'],workerSHA256:sha(read('index.mjs')),migrationSHA256:manifest.migration.sha256}));

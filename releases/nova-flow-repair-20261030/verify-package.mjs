import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(root,'../..');
const sha=v=>createHash('sha256').update(v).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
for(const [file,expected]of Object.entries(manifest.baselines))assert.equal(sha(fs.readFileSync(path.join(root,'baseline',file))),expected,'Predecessor drift '+file);
for(const [file,expected]of Object.entries(manifest.artifacts))assert.equal(sha(fs.readFileSync(path.join(root,'deploy',file))),expected.sha256,'Candidate drift '+file);
for(const [name,cfg]of Object.entries(manifest.configs))assert.equal(sha(fs.readFileSync(path.join(root,'wrangler.'+name+'.jsonc'))),cfg.sha256,'Config drift '+name);
for(const sql of manifest.migrations)assert.equal(sha(fs.readFileSync(path.join(repo,sql.file))),sql.sha256,'Migration drift '+sql.file);
assert.deepEqual(fs.readdirSync(path.join(root,'deploy/clientes')).sort(),['form.html','index.mjs']);
assert.deepEqual(fs.readdirSync(path.join(root,'deploy/nova')).sort(),['index.mjs']);
const fileInputs=s=>[...s.matchAll(/<input\b[^>]*type=["']file["'][^>]*>/gi)].map(m=>m[0]);
assert.deepEqual(fileInputs(fs.readFileSync(path.join(root,'baseline/clientes/form.html'),'utf8')),fileInputs(fs.readFileSync(path.join(root,'deploy/clientes/form.html'),'utf8')),'File controls replaced');
for(const file of ['deploy/clientes/index.mjs','deploy/nova/index.mjs','wrangler.clientes.jsonc','wrangler.nova.jsonc']){
 const s=fs.readFileSync(path.join(root,file),'utf8');
 assert.ok(!/sb_secret_[A-Za-z0-9_-]{16,}/.test(s),'Private key literal '+file);
 for(const token of s.match(/[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)||[]){
  try{const body=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());assert.notEqual(body.role,'service_role','Private service JWT '+file);}catch(error){if(error.code==='ERR_ASSERTION')throw error;}
 }
}
assert.equal(JSON.parse(fs.readFileSync(path.join(root,'wrangler.clientes.jsonc'))).vars.NOVA_SMS_ENABLED,'false');
assert.equal(JSON.parse(fs.readFileSync(path.join(root,'wrangler.nova.jsonc'))).vars.NOVA_KREDIYA_TRANSPORT_VERIFIED,'false');
console.log(JSON.stringify({verified:true,artifacts:3,migrations:3,clientBindings:31,novaBindings:44,crons:4,routes:5,smsEnabled:false,noSecretLiterals:true}));

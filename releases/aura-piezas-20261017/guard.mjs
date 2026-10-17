import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';import assert from'node:assert/strict';
const hash=x=>createHash('sha256').update(x).digest('hex'),after=process.argv.includes('--after'),dir=new URL('./',import.meta.url);
const token=(await readFile('/Users/oscarm/.wrangler/config/default.toml','utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
async function get(p){const r=await fetch('https://api.cloudflare.com/client/v4'+p,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});assert.ok(r.ok,'HTTP '+r.status);return r;}
const base='/accounts/853eee9e3d80f805fee58f4f99507e8a/workers';
const parts=await(await get(base+'/services/creditek-aura-shell/environments/production/content')).formData();assert.equal([...parts].length,1);const part=[...parts.values()][0];const code=typeof part==='string'?part:await part.text();
assert.equal(hash(code),hash(await readFile(new URL(after?'worker.mjs':'baseline-worker.mjs',dir))),'Live worker changed');
const settings=(await(await get(base+'/scripts/creditek-aura-shell/settings')).json()).result;
assert.deepEqual(settings.bindings,[]);assert.equal(settings.compatibility_date,'2026-07-23');assert.deepEqual(settings.compatibility_flags,[]);
const routes=(await(await get('/zones/4117c7a89e988ae0869c02755ffa77ab/workers/routes')).json()).result;
const saved=JSON.parse(await readFile('/tmp/aura-routes.json','utf8')).result;
assert.deepEqual(routes.filter(x=>x.script==='creditek-aura-shell'),saved.filter(x=>x.script==='creditek-aura-shell'));
for(const suffix of ['creditek-agente-redes','creditek-agente-redes.html']){const r=await fetch('https://aura.crediteksas.com/creditek/agentes/'+suffix,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);assert.equal(hash(await r.text()),hash(await readFile(new URL(after?'candidate.html':'original.html',dir))));if(after)assert.equal(r.headers.get('x-aura-piezas-release'),'20261017');}
console.log(JSON.stringify({after,workerHash:hash(code),routesPreserved:true,bindingsPreserved:true,publisherVerified:true}));

import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
import{registrationGateway}from'./gateway.mjs';import{authenticateAuraRegistrationLinks}from'./auth.mjs';
import{Miniflare,Response as MFResponse}from'/Users/oscarm/Creditek/baseline/consultora/node_modules/miniflare/dist/src/index.js';
const url='https://registration.internal/api/aura/enlaces/origenes';let calls=0;
const upstream={async fetch(r){calls++;assert.equal(r.headers.get('authorization'),'Bearer test-only');return Response.json([]);}};
assert.equal((await registrationGateway(new Request(url),{},upstream)).status,403);assert.equal(calls,0);
assert.equal((await registrationGateway(new Request(url,{method:'POST'}),{},upstream)).status,405);
assert.equal((await registrationGateway(new Request(url),{ADMIN_ENLACES_TOKEN:'test-only'},upstream,async()=>({user:{id:'owner'}}))).status,200);assert.equal(calls,1);
assert.equal((await registrationGateway(new Request('https://registration.internal/api/aura/enlaces',{method:'POST',body:'x'.repeat(4097)}),{ADMIN_ENLACES_TOKEN:'test-only'},upstream,async()=>({}))).status,413);assert.equal(calls,1);
for(const role of ['aura.owner','other']){let n=0;const fetcher=async()=>Response.json(++n===1?{id:'u',email:'owner@example.test'}:{user_id:'u',email:'owner@example.test',active:true,apps:[{role_id:role}]});const a=await authenticateAuraRegistrationLinks(new Request(url,{headers:{authorization:'Bearer test'}}),fetcher);assert.equal(Boolean(a),role==='aura.owner');}
const mf=new Miniflare({modules:true,script:await readFile(new URL('./index.mjs',import.meta.url),'utf8'),compatibilityDate:'2026-01-15',compatibilityFlags:['nodejs_compat'],bindings:{NOVA_REGISTRATION_RECOVERY_ENABLED:'true'},outboundService:async()=>new MFResponse('[]',{status:401})});
try{
for(const path of ['/nova/registro','/nova/registro-inicio','/nova/registro-recuperar']){const r=await mf.dispatchFetch('https://registro.crediteksas.com'+path);assert.equal(r.status,200,path);assert(r.headers.get('content-type').includes('text/html'));}
const form=await(await mf.dispatchFetch('https://registro.crediteksas.com/nova/registro')).text();for(const text of ['Tomar foto','Seleccionar archivo','Autorizo'])assert(form.includes(text),text);
assert.equal((await mf.dispatchFetch('https://registro.crediteksas.com/nova/registro',{method:'POST'})).status,405);
assert.equal((await mf.dispatchFetch('https://registro.crediteksas.com/api/admin/origenes-enlaces')).status,401);
assert.equal((await mf.dispatchFetch('https://registro.crediteksas.com/internal/nova-reference-source',{method:'POST',body:'{}'})).status,401);
console.log('PASS: gateway auth, role denial, 4KB body cap, forms restored, photo options, private routes fail closed');
}finally{await mf.dispose();}

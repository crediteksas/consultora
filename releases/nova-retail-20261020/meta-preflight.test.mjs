import test from 'node:test';import assert from 'node:assert/strict';
import {prepareTemplates,REFERENCE_TEMPLATE,templateHealth} from './meta-preflight.mjs';
const fake=()=>{const m=new Map();return {NOVA_RETAIL_PREPARE_ENABLED:'true',NOVA_META_ACCESS_TOKEN:'fake-token',NOVA_WABA_ID:'test',NOVA_EVENTS:{get:async k=>m.has(k)?JSON.parse(m.get(k)):null,put:async(k,v)=>m.set(k,v)}};};
test('preflight submits only missing reference template; it sends no messages',async()=>{
 const env=fake();let submitted=0;await prepareTemplates(env,async(url,init)=>{
  assert.ok(url.includes('/message_templates'));assert.ok(!url.includes('/messages?'));
  if(init.method==='POST'){submitted++;assert.deepEqual(JSON.parse(init.body),REFERENCE_TEMPLATE);return Response.json({status:'PENDING'});}
  return Response.json({data:url.includes('nova_aviso_ejecutivo_v1')?[{name:'nova_aviso_ejecutivo_v1',language:'es_CO',status:'APPROVED'}]:[]});
 });assert.equal(submitted,1);assert.equal((await templateHealth(env)).ready,false);
});
test('wrong content never reports ready; failure does not leak token',async()=>{
 const env=fake();await prepareTemplates(env,async()=>Response.json({data:[{name:REFERENCE_TEMPLATE.name,language:'es_CO',category:'UTILITY',status:'APPROVED',components:[{type:'BODY',text:'different'}]}]}));assert.equal((await templateHealth(env)).reference,'CONTENT_MISMATCH');assert.equal((await templateHealth(env)).ready,false);
});

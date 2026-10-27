import test from 'node:test';import assert from 'node:assert/strict';import {createRetailRuntime} from './retail-runtime.mjs';
const actor='11111111-1111-4111-8111-111111111111',caseId='22222222-2222-4222-8222-222222222222';
const env={NOVA_RETAIL_ENABLED:'true',KORA_SUPABASE_SERVICE_ROLE_KEY:'fake-kora',SUPABASE_SERVICE_ROLE_KEY:'fake-aura'};
const secret='INTERNAL_ZERO_PAYMENTS_REASON';
const caseRow=(store='CK-01')=>({source_id:caseId,store_code:store,state:'rejected',revision:1,summary:{name:'Fixture local only',platforms:[{reason:secret}],references:[]},decision:{reasons:[secret]}});
function setup({store='CK-01',global=false,canReview=false,row=caseRow(),aura=false,mismatch=false}={}){
 const calls=[];const fetcher=async(url,init)=>{calls.push({url,init});
  if(url.includes('/auth/v1/user'))return aura?(url.includes('jfkm')?Response.json({}, {status:401}):Response.json({id:actor,email:'fixture@example.test',email_confirmed_at:'2026-01-01T00:00:00Z'})):Response.json({id:actor});
  if(url.includes('/auth/v1/admin/users/'))return Response.json({id:actor,email:mismatch?'different@example.test':'fixture@example.test'});
  if(url.includes('/nova_retail_actor_emails?'))return Response.json([{actor_id:actor}]);
  if(url.includes('/perfiles?'))return Response.json([{id:actor,nombre:'Fixture',rol:'admin_tienda',tienda_codigo:store}]);
  if(url.includes('/nova_retail_reviewers?'))return Response.json(global?[{can_review:canReview}]:[]);
  if(url.includes('/nova_retail_cases?'))return Response.json([row]);
  if(url.includes('/nova_retail_store_contacts?'))return Response.json([]);
  if(url.includes('/origenes?'))return Response.json([{codigo:store,nombre:'Nombre oficial de la tienda'}]);
  if(url.includes('/tiendas?'))return Response.json([{telefono:null}]);
  assert.fail('Unexpected external call '+url);
 };
 return {runtime:createRetailRuntime({fetcher}),calls};
}
const req=(body,origin='https://aura.crediteksas.com')=>new Request('https://creditek-nova.comercial-853.workers.dev/api/retail',{method:'POST',headers:{origin,authorization:'Bearer local-fixture-token-at-least-twenty','content-type':'application/json'},body:JSON.stringify(body)});

test('all nine stores are scoped at server and rejection reasons never reach store',async()=>{
 for(let i=1;i<=9;i++){
  const store='CK-'+String(i).padStart(2,'0'),{runtime,calls}=setup({store,row:caseRow(store)}),r=await runtime.api(req({action:'list'}),env);
  assert.equal(r.status,200);const text=await r.text();assert.equal(JSON.parse(text).cases[0].storeName,'Nombre oficial de la tienda');assert.equal(JSON.parse(text).actor.storeName,'Nombre oficial de la tienda');assert(!text.includes(secret));assert(!text.includes('platforms'));assert(calls.some(c=>c.url.includes('store_code=eq.'+store)));
 }
});
test('foreign cases and history cannot be read through a guessed id',async()=>{
 for(const action of ['detail','history','document','replaceReference','review','requery','deliver']){
  const {runtime,calls}=setup({row:caseRow('CK-02')}),r=await runtime.api(req({action,id:caseId,type:'frente'}),env);assert.equal(r.status,403,action);assert(!calls.some(c=>c.url.includes('kora_nova_sources')));
 }
});
test('a foreign row returned unexpectedly by database fails closed on list',async()=>{
 const {runtime}=setup({row:caseRow('CK-02')});const r=await runtime.api(req({action:'list'}),env);assert.equal(r.status,403);assert(!(await r.text()).includes(secret));
});
test('owner can read all stores, but only reviewer may approve',async()=>{
 const {runtime}=setup({global:true,row:caseRow('CK-09')});const r=await runtime.api(req({action:'list'}),env);assert.equal(r.status,200);assert((await r.text()).includes(secret));
 assert.equal((await runtime.api(req({action:'review',id:caseId,decision:'approve',note:'local test only'}),env)).status,403);
});
test('Aura session maps only through verified email to an active Kora actor',async()=>{
 let s=setup({aura:true});assert.equal((await s.runtime.api(req({action:'list'}),env)).status,200);
 s=setup({aura:true,mismatch:true});assert.equal((await s.runtime.api(req({action:'list'}),env)).status,403);assert(!s.calls.some(c=>c.url.includes('/nova_retail_cases?')));
});
test('cross-origin, unauthenticated, inactive pilot and excessive bodies are denied',async()=>{
 const {runtime,calls}=setup();assert.equal((await runtime.api(req({action:'list'},'https://untrusted.example'),env)).status,403);assert.equal(calls.length,0);
 const noAuth=new Request('https://nova.test/api/retail',{method:'POST',body:'{}'});assert.equal((await runtime.api(noAuth,env)).status,401);
 assert.equal((await runtime.api(req({action:'list'}),{...env,NOVA_RETAIL_ENABLED:'false'})).status,503);
 const huge=await runtime.api(req({action:'list',data:'x'.repeat(9000)}),env);assert.equal(huge.status,409);
});

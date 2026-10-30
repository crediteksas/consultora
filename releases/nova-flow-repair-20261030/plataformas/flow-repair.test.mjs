import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {transformNova,transformClientes} from './transform.mjs';
const sourcePath=new URL('../baseline/nova/index.mjs',import.meta.url);
const baseline=await readFile(sourcePath,'utf8');
const source=process.env.NOVA_REPAIR_CANDIDATE?await readFile(process.env.NOVA_REPAIR_CANDIDATE,'utf8'):transformNova(baseline);
const slice=(a,b)=>{const start=source.indexOf(a);assert.ok(start>=0,a);const end=source.indexOf(b,start);assert.ok(end>start,b);return source.slice(start,end);};
const now=Date.now();
const consent={granted:true,revoked:false,text_version:'nova-platform-query-v1',platforms:['ALO','PAYJOY','KREDIYA'],accepted_at:new Date(now-1000).toISOString(),expires_at:new Date(now+3600000).toISOString()};
const ids={actor:'11111111-1111-4111-8111-111111111111',source:'22222222-2222-4222-8222-222222222222',client:'33333333-3333-4333-8333-333333333333',otp:'44444444-4444-4444-8444-444444444444',app:'55555555-5555-4555-8555-555555555555'};
const sha=async v=>createHash('sha256').update(v).digest('hex');
const __name=(v)=>v;
const policy=slice('var POLICY_VERSION = "retail-20261020-v1";','var KORA3 =');
const diagnostics=slice('function summarizeReference(r, at = Date.now())','var ALLOWED_ORIGINS =');
const runtime=slice('function createRetailRuntime({ fetcher = fetch, now = Date.now, makeInvitation } = {})','__name(createRetailRuntime,');
const preparation=slice('async function prepareRetailRequery(sourceId, env,','function createRetailRuntime(');
const valid=slice('function validPlatformConsent(consent2, now = Date.now())','__name(validPlatformConsent,')+'\n'+slice('function canonicalConsent(c) {','__name(canonicalConsent,');
const buildFactory=runtime=>new Function('__name','PUBLIC_KEY','KORA3','AURA5','UUID6','TYPES','ALLOWED_ORIGINS','sha','readRenewalSource','currentSource','PLATFORM_CONSENT_VERSION','QUERY_PLATFORMS','templateHealth',
 policy+'\n'+diagnostics+'\n'+valid+'\n'+preparation+'\n'+runtime+'\nreturn {createRetailRuntime,evaluatePlatforms,prepareRetailRequery,restoreRetailRequery};')(__name,'public-test','https://kora.invalid','https://aura.invalid',/^[a-f0-9-]{36}$/i,['frente','reverso','selfie'],new Set(['https://aura.crediteksas.com']),sha,async(id,env)=>{env.preparationReads++;return env.context;},async(job,env)=>env.verifySource!==false,'nova-platform-query-v1',['PAYJOY','KREDIYA','ALO'],async()=>({staff:'APPROVED',ready:true}));
const factory=buildFactory(runtime);
const baselineRuntime=baseline.slice(baseline.indexOf('function createRetailRuntime({ fetcher = fetch, now = Date.now, makeInvitation } = {})'),baseline.indexOf('__name(createRetailRuntime,',baseline.indexOf('function createRetailRuntime({ fetcher = fetch, now = Date.now, makeInvitation } = {})')));
const baselineFactory=buildFactory(baselineRuntime);
const json=v=>new Response(JSON.stringify(v),{headers:{'content-type':'application/json'}});
function fixture({global=true,caseStore='CK-05',activeDataConsent=true,caseRevoked=false,requery=false,jobBatch=null,jobStatus='queued',jobConsent=consent,jobInputs=null,implementation=factory}={}){
 const calls=[];
 const source={solicitud_id:ids.source,cliente_id:ids.client,otp_id:ids.otp,input_hash:'a'.repeat(64),revoked_at:caseRevoked?'2026-10-30T19:00:00Z':null,registration:{p_nombre_completo:'Persona sintética',p_origen_codigo:caseStore,p_celular:'3000000001'},effectiveReferences:[]};
 const prior={source_id:ids.source,cliente_id:ids.client,store_code:caseStore,state:'review',revision:1,summary:{name:'Persona sintética'},query_request_id:requery?'66666666-6666-4666-8666-666666666666':null};
 const state={activeDataConsent,source,prior,calls};
 const fetcher=async(input,options={})=>{
   const url=String(input);calls.push({url,method:options.method||'GET'});
   if(url==='https://kora.invalid/auth/v1/user')return json({id:ids.actor});
   const path=url.split('/rest/v1/')[1];
   if(!path)throw Error('Unexpected network URL');
   if(path.startsWith('perfiles?'))return json([{id:ids.actor,nombre:'Revisor sintético',rol:'admin_tienda',tienda_codigo:'CK-02'}]);
   if(path.startsWith('nova_retail_reviewers?'))return json(global?[{can_review:true}]:[]);
   if(path.startsWith('origenes?'))return json([{codigo:caseStore,nombre:'Tienda sintética'}]);
   if(path.startsWith('nova_retail_cases?')){
     if(options.method==='PATCH')return new Response(null,{status:204});
     return json([prior]);
   }
   if(path.startsWith('kora_nova_sources?'))return json([source]);
   if(path==='rpc/kora_nova_effective_references')return json([]);
   if(path==='rpc/nova_retail_consent_current')return json(state.activeDataConsent);
   if(path==='rpc/nova_retail_notification_claim'){
    if(state.noticeClaimed)return json(null);state.noticeClaimed=true;
    return json({id:ids.app,source_id:ids.source,attempt_id:ids.otp,audience:'andrea',store_code:caseStore,case_state:'review'});
   }
   if(path==='rpc/nova_retail_notification_finish'){state.noticeFinish=JSON.parse(options.body);return json(true);} 
   if(path.startsWith('nova_platform_jobs?')){
     if(options.method==='PATCH')return new Response(null,{status:204});
     return json(requery?['ALO','PAYJOY'].map((platform,i)=>({id:'77777777-7777-4777-8777-77777777777'+i,platform,status:jobStatus,retail_batch_id:jobBatch||prior.query_request_id,inputs:jobInputs,consent:jobConsent})):[]);
   }
   if(path.startsWith('nova_retail_photo_reviews?')||path.startsWith('documentos_solicitud?')||path.startsWith('nova_reference_')||path.startsWith('nova_retail_reference_dispatch?')||path.startsWith('nova_retail_case_events?')||path.startsWith('nova_retail_photo_events?'))return json([]);
   if(path.startsWith('nova_registration_receipts?'))return json([{application_id:ids.app,payload_hash:'b'.repeat(64)}]);
   if(path==='rpc/nova_retail_requery')return json(true);
   if(path==='rpc/nova_retail_save'){
     const b=JSON.parse(options.body);return json({...prior,state:b.p_decision.state,decision:b.p_decision,summary:b.p_summary});
   }
   if(path.startsWith('nova_retail_store_contacts?')||path.startsWith('tiendas?'))return json([]);
   if(path.startsWith('clientes?'))return json([{id:ids.client,autorizacion_datos:activeDataConsent}]);
   throw Error('Unexpected mocked database path '+path);
 };
 const env={NOVA_RETAIL_ENABLED:'true',KORA_SUPABASE_SERVICE_ROLE_KEY:'test-key',SUPABASE_SERVICE_ROLE_KEY:'test-key',NOVA_PII_HASH_PEPPER:'fixture',NOVA_KREDIYA_EXECUTOR_ENABLED:'false',NOVA_KREDIYA_TRANSPORT_VERIFIED:'false',preparationReads:0,context:{source_application_id:ids.source,active:true,document:'12345678',phone:'3000000001',consent}};
 const instance=implementation.createRetailRuntime({fetcher,now:()=>now,makeInvitation:async()=>({})});
 const request=b=>new Request('https://nova.invalid/api/retail',{method:'POST',headers:{authorization:'Bearer '+'x'.repeat(40),origin:'https://aura.crediteksas.com','content-type':'application/json'},body:JSON.stringify(b)});
 return {...state,state,instance,env,request};
}
test('Andrea path: a registered active reviewer receives backend global+canReview',async()=>{
 const f=fixture();const actor=await f.instance.authenticate(f.request({}),f.env);
 assert.equal(actor.global,true);assert.equal(actor.canReview,true);
});
test('Store account cannot open a case from another store',async()=>{
 const f=fixture({global:false,caseStore:'CK-05'});const r=await f.instance.api(f.request({action:'detail',id:ids.source}),f.env);
 assert.equal(r.status,403);assert.deepEqual(await r.json(),{error:'NOT_FOUND'});
 assert.ok(!f.calls.some(c=>c.url.includes('kora_nova_sources?')));
});
test('Retail details mark current master revocation without deleting historical summary',async()=>{
 const f=fixture({activeDataConsent:false});const r=await f.instance.api(f.request({action:'detail',id:ids.source}),f.env);
 assert.equal(r.status,200);const d=await r.json();assert.equal(d.case.summary.name,'Persona sintética');
 assert.ok(!f.calls.some(c=>c.url.includes('/clientes?')));
 assert.ok(d.case.decision.reasons.includes('consent_revoked'));
 assert.equal(d.case.decision.canProcess,false);
});
test('Control: an explicit source revocation is recognized',async()=>{
 const f=fixture({caseRevoked:true});const r=await f.instance.api(f.request({action:'detail',id:ids.source}),f.env);
 assert.equal(r.status,200);const d=await r.json();assert.deepEqual(d.case.decision.reasons,['consent_revoked']);
});
test('Evidence repairs the same interrupted batch with current consent and no provider call',async()=>{
 const f=fixture({requery:true});const s=await f.instance.source?.(f.env,ids.source)||{...f.source,generalConsentActive:true};await f.instance.evidence(f.env,s);
 assert.ok(f.calls.some(c=>c.url.endsWith('/rpc/nova_retail_requery')));
 const patches=f.calls.filter(c=>c.method==='PATCH'&&c.url.includes('nova_platform_jobs?'));
 assert.equal(patches.length,3);assert.equal(f.env.preparationReads,1);
 assert.ok(patches.every(c=>c.url.includes(f.prior.query_request_id)));
 assert.ok(!f.calls.some(c=>/graph\.facebook|partner\.payjoy|alocredit/.test(c.url)));
});
test('Provider outages do not count as successful platform checks',()=>{
 const decision=factory.evaluatePlatforms(['ALO','PAYJOY','KREDIYA'].map(platform=>({platform,status:platform==='KREDIYA'?'blocked':'unavailable',identityVerified:false,checkedAt:new Date(now).toISOString(),obligations:[]})),now);
 assert.equal(decision.state,'review');assert.equal(decision.successfulPlatforms,0);assert.ok(decision.reasons.includes('fewer_than_two_platforms'));
});


test('New actions including photos are blocked after master revocation',async()=>{
 for(const action of ['review','requery','deliver','replaceReference','document']){
  const f=fixture({activeDataConsent:false});const r=await f.instance.api(f.request({action,id:ids.source,type:'frente'}),f.env);
  assert.equal(r.status,409,action);assert.deepEqual(await r.json(),{error:'CONSENT_REVOKED'});
  assert.ok(!f.calls.some(c=>c.url.includes('/storage/')));
 }
});
test('Interrupted batch is not restored if platform consent expired',async()=>{
 const f=fixture({requery:true});f.env.context={...f.env.context,consent:{...consent,expires_at:new Date(now-1).toISOString()}};
 await f.instance.evidence(f.env,{...f.source,generalConsentActive:true});
 assert.ok(!f.calls.some(c=>c.method==='PATCH'&&c.url.includes('nova_platform_jobs?')));
});
test('Interrupted batch is not restored after master revocation',async()=>{
 const f=fixture({requery:true,activeDataConsent:false});await f.instance.evidence(f.env,{...f.source,generalConsentActive:false});
 assert.ok(!f.calls.some(c=>c.url.endsWith('/rpc/nova_retail_requery')));
 assert.ok(!f.calls.some(c=>c.method==='PATCH'&&c.url.includes('nova_platform_jobs?')));
});
test('Transforms fail on replay and add only one backend RPC to CLIENTES',async()=>{
 assert.throws(()=>transformNova(source),/Anchor changed/);
 const old=await readFile(new URL('../baseline/clientes/index.mjs',import.meta.url),'utf8');
 const changed=transformClientes(old);assert.equal(changed.split('nova_retail_consent_current').length-1,1);
 assert.equal(changed.replace(', \"nova_retail_consent_current\"',''),old);assert.throws(()=>transformClientes(changed),/Anchor changed/);
});

test('Repair ignores terminal jobs and batches that no longer match',async()=>{
 for(const opts of [{jobStatus:'observed'},{jobBatch:'88888888-8888-4888-8888-888888888888'}]){
  const f=fixture({requery:true,...opts});await f.instance.evidence(f.env,{...f.source,generalConsentActive:true});
  assert.equal(f.env.preparationReads,0);assert.ok(!f.calls.some(c=>c.method==='PATCH'&&c.url.includes('nova_platform_jobs?')));
 }
});
test('Repair cannot replace the stored authorization with a different consent',async()=>{
 const f=fixture({requery:true,jobConsent:{...consent,accepted_at:new Date(now-2000).toISOString()}});
 await f.instance.evidence(f.env,{...f.source,generalConsentActive:true});
 assert.equal(f.env.preparationReads,1);assert.ok(!f.calls.some(c=>c.method==='PATCH'&&c.url.includes('nova_platform_jobs?')));
});
test('Repair rejects conflicting saved locators before any patch',async()=>{
 const f=fixture({requery:true,jobInputs:{document:'87654321',phone:'3000000001'}});
 const prepared=await factory.prepareRetailRequery(ids.source,f.env);
 assert.deepEqual(prepared.inputs,{document:'12345678',phone:'3000000001'});
 assert.equal(f.env.preparationReads,1);
 await assert.rejects(factory.restoreRetailRequery(prepared,f.prior.query_request_id,f.env,f.instance.db),error=>error.name==='Error'&&error.message==='QUERY_INPUT_CONFLICT');
 assert.ok(!f.calls.some(c=>c.method==='PATCH'&&c.url.includes('nova_platform_jobs?')));
});
test('Unknown master-consent state fails closed without serving photos',async()=>{
 const f=fixture({activeDataConsent:null});const r=await f.instance.api(f.request({action:'document',id:ids.source,type:'frente'}),f.env);
 assert.equal(r.status,409);assert.ok(!f.calls.some(c=>c.url.includes('/storage/')));
});
test('Revoked source does not dispatch a new reference invitation',async()=>{
 const f=fixture({activeDataConsent:false});await f.instance.sendReferences(f.env,ids.source);
 assert.ok(f.calls.some(c=>c.url.includes('nova_retail_consent_current')));
 assert.ok(!f.calls.some(c=>c.url.includes('nova_retail_reference_reserve')||c.url.includes('graph.facebook')));
});
test('Revoked source closes a claimed notice without dispatch',async()=>{
 const f=fixture({activeDataConsent:false});await f.instance.sendNotices(f.env);
 assert.equal(f.state.noticeFinish.p_state,'failed');assert.equal(f.state.noticeFinish.p_error,'CONSENT_REVOKED');
 assert.ok(!f.calls.some(c=>c.url.includes('graph.facebook')));
});

test('Active consent preserves the exact prior fingerprint and historical approval identity',async()=>{
 const before=fixture({implementation:baselineFactory}),after=fixture();
 const old=await before.instance.evidence(before.env,{...before.source,generalConsentActive:true});
 const current=await after.instance.evidence(after.env,{...after.source,generalConsentActive:true});
 assert.deepEqual(current.summary,old.summary);assert.deepEqual(current.decision,old.decision);
 assert.equal(current.fingerprint,old.fingerprint);
});
test('Revocation changes the fingerprint; legitimate restoration differs from the revoked state',async()=>{
 const f=fixture();const active=await f.instance.evidence(f.env,{...f.source,generalConsentActive:true});
 const revoked=await f.instance.evidence(f.env,{...f.source,generalConsentActive:false});
 const restored=await f.instance.evidence(f.env,{...f.source,generalConsentActive:true});
 assert.notEqual(revoked.fingerprint,active.fingerprint);assert.deepEqual(revoked.decision.reasons,['consent_revoked']);
 assert.equal(restored.fingerprint,active.fingerprint);assert.notEqual(restored.fingerprint,revoked.fingerprint);
});

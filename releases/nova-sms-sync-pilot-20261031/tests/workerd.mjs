import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Miniflare,Response as MFResponse,convertV4MiniflareOptions} from '/Users/oscarm/.npm/_npx/2fea031b5bd76b2e/node_modules/miniflare/dist/src/index.js';
import {sha} from '../transform.mjs';
const source=await readFile(new URL('../deploy/clientes/index.mjs',import.meta.url),'utf8');
const anchor='  index_default3 as default,';assert.equal(source.split(anchor).length,2);
// Test-only wrapper observes native AbortSignal timeout arguments. The file
// that is published is untouched; all network destinations are intercepted.
const script="const __testTimeouts=[];const __testTimeout=AbortSignal.timeout.bind(AbortSignal);AbortSignal.timeout=ms=>{__testTimeouts.push(ms);return __testTimeout(ms);};\n"+source.replace(anchor,'  index_default3 as __testShippedDefault,')+"\nexport default {async fetch(request,env,ctx){const response=await index_default3.fetch(request,env,ctx);response.headers.set('x-closed-mock-timeouts',JSON.stringify(__testTimeouts));return response;}};\n";
const ids={link:'10000000-0000-4000-8000-000000000001',request:'20000000-0000-4000-8000-000000000002',otp:'30000000-0000-4000-8000-000000000003',attempt:'40000000-0000-4000-8000-000000000004',consumption:'50000000-0000-4000-8000-000000000005'};
const bindings={NOVA_SMS_ENABLED:'true',INALAMBRIA_SMS_API_KEY:'sk_test_closed_mock_never_real',SUPABASE_SERVICE_KEY:'closed-mock',TOKEN_HASH_SECRET:'closed-mock',TURNSTILE_SECRET_KEY:'closed-mock',ALLOWED_ORIGIN:'https://registro.crediteksas.com',ALLOW_LEGACY_REGISTRATION_LINKS:'false'};
const checks=[];
for(const config of [{name:'SQL disabled',enabled:false,status:200},{name:'accepted then identical UUID replay',enabled:true,status:200},{name:'provider401 then replay',enabled:true,status:401},{name:'provider429 then replay',enabled:true,status:429}]){
 let row=null;const calls={provider:0,reserve:0,finish:0,captcha:0,unknown:0};const json=(v,status=200)=>new MFResponse(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});
 const outboundService=async request=>{const u=new URL(request.url);
  if(u.origin==='https://jfkmiyvcdfbsbwchyvol.supabase.co'){
   if(u.pathname==='/rest/v1/enlaces_registro')return json([{id:ids.link,origen_codigo:'CK-05',captador_id:null}]);
   if(u.pathname==='/rest/v1/origenes')return json([{codigo:'CK-05',nombre:'TIENDA SINTETICA'}]);
   if(u.pathname==='/rest/v1/captadores')return json([]);
   if(u.pathname==='/rest/v1/rpc/nova_client_otp_status')return json(row?{...row,found:true}:{found:false});
   if(u.pathname==='/rest/v1/rpc/nova_client_otp_reserve'){calls.reserve++;if(!config.enabled)return json({message:'SMS_DISABLED'},400);const b=await request.json();assert.equal(b.p_request_id,ids.request);row={requestId:ids.request,attemptId:ids.attempt,otpId:ids.otp,channel:'sms',state:'reserved',canSend:true,reservedCostCop:39,expiresAt:new Date(Date.now()+300000).toISOString()};return json(row);}
   if(u.pathname==='/rest/v1/rpc/nova_client_otp_finish'){calls.finish++;const b=await request.json();assert.equal(b.p_request_id,ids.request);assert.equal(b.p_attempt_id,ids.attempt);assert.equal(b.p_status,config.status===200?'accepted':'failed');row={...row,state:b.p_status,canSend:false};return json(row);}
  }
  if(u.origin==='https://challenges.cloudflare.com'&&u.pathname==='/turnstile/v0/siteverify'){calls.captcha++;return json({success:true,hostname:'registro.crediteksas.com',action:'registro-cliente'});}
  if(u.origin==='https://api.inalambria.express'&&u.pathname==='/v1/messages/send'){calls.provider++;assert.equal(request.headers.get('authorization'),'Bearer '+bindings.INALAMBRIA_SMS_API_KEY);const b=await request.json();assert.deepEqual(b.recipients,['+573000000000']);assert.equal(b.async,false);return json(config.status===200?{ok:true,consumptionId:ids.consumption,messages:1,credits:1,amount:39,currency:'COP'}:{error:'synthetic-provider-rejected'},config.status);}
  calls.unknown++;return json({error:'CLOSED_MOCK_UNKNOWN_DESTINATION'},503);
 };
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script,compatibilityDate:'2026-01-15',compatibilityFlags:['nodejs_compat'],bindings,cf:false,outboundService}));
 try{const post=async()=>{const r=await mf.dispatchFetch('https://registro.crediteksas.com/api/otp/enviar',{method:'POST',headers:{'content-type':'application/json',origin:'https://registro.crediteksas.com'},body:JSON.stringify({enlace_token:'synthetic-registration-link-at-least32',cedula:'12345678',celular:'3000000000',turnstile_token:'synthetic-captcha',channel:'sms',sms_reason:'no_whatsapp',request_id:ids.request})});return {status:r.status,body:await r.json(),timeouts:JSON.parse(r.headers.get('x-closed-mock-timeouts'))};};
  const first=await post();assert.equal(first.body.state,config.enabled?(config.status===200?'accepted':'failed'):'not_sent');if(config.enabled){await post();assert.equal(calls.provider,1);assert.equal(calls.reserve,1);assert.equal(calls.finish,1);assert.equal(first.timeouts.filter(x=>x===30000).length,1);assert.ok(first.timeouts.includes(8000));}else{assert.equal(calls.provider,0);assert.equal(first.timeouts.includes(30000),false);}assert.equal(calls.unknown,0);
  checks.push({name:config.name,passed:true,calls,nativeProviderTimeoutObserved:config.enabled?30000:null,responseState:first.body.state,realMessages:0});
 }finally{await mf.dispose();}
}
const result={checkedAtUTC:new Date().toISOString(),engine:'Complete candidate bundle in actual workerd/Miniflare; closed outboundService mocks and test-only native timeout observation',candidateWorkerSha256:sha(source),tests:checks.length,passed:checks.length,failed:0,checks,realProviderCalls:0,productionReads:0,productionWrites:0,realMessages:0};await writeFile(new URL('./workerd-receipt.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));

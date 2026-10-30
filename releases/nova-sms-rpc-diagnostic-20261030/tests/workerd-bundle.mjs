import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Miniflare,Response as MFResponse,convertV4MiniflareOptions} from '/Users/oscarm/.npm/_npx/2fea031b5bd76b2e/node_modules/miniflare/dist/src/index.js';
import {sha} from '../transform.mjs';
const root=new URL('../',import.meta.url),baseline=await readFile(new URL('baseline/index.mjs',root),'utf8'),candidate=await readFile(new URL('deploy/index.mjs',root),'utf8');
const ids={link:'10000000-0000-4000-8000-000000000001',request:'20000000-0000-4000-8000-000000000001',otp:'30000000-0000-4000-8000-000000000001',attempt:'40000000-0000-4000-8000-000000000001',consumption:'50000000-0000-4000-8000-000000000001'};
const bindings={NOVA_SMS_ENABLED:'true',INALAMBRIA_SMS_API_KEY:'sk_test_synthetic_not_real',SUPABASE_SERVICE_KEY:'synthetic-not-a-key',TOKEN_HASH_SECRET:'synthetic-not-a-secret',TURNSTILE_SECRET_KEY:'synthetic-not-a-secret',ALLOW_LEGACY_REGISTRATION_LINKS:'false'};
const checks=[];
for(const [label,source]of[['baseline',baseline],['candidate',candidate]]){
 const counts={context:0,options:0,status:0,reserve:0,finish:0,captcha:0,provider:0,unexpected:0};let row=null;
 const json=(v,status=200)=>new MFResponse(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});
 const outboundService=async request=>{
  const u=new URL(request.url);
  if(u.hostname.endsWith('.supabase.co')){
   if(u.pathname==='/rest/v1/enlaces_registro'){counts.context++;return json([{id:ids.link,origen_codigo:'CK-TEST',captador_id:null}]);}
   if(u.pathname==='/rest/v1/origenes')return json([{codigo:'CK-TEST',nombre:'TIENDA SINTETICA'}]);
   if(u.pathname==='/rest/v1/captadores')return json([]);
   if(u.pathname==='/rest/v1/rpc/nova_client_otp_options'){counts.options++;return json({smsEnabled:true});}
   if(u.pathname==='/rest/v1/rpc/nova_client_otp_status'){counts.status++;return json(row?{...row,found:true}:{found:false});}
   if(u.pathname==='/rest/v1/rpc/nova_client_otp_reserve'){
    counts.reserve++;const body=await request.json();assert.equal(body.p_request_id,ids.request);assert.equal(body.p_channel,'sms');
    row={requestId:ids.request,channel:'sms',attemptId:ids.attempt,otpId:ids.otp,state:'reserved',reservedCostCop:39,canSend:true,expiresAt:new Date(Date.now()+300000).toISOString()};return json(row);
   }
   if(u.pathname==='/rest/v1/rpc/nova_client_otp_finish'){
    counts.finish++;const body=await request.json();assert.equal(body.p_status,'accepted');assert.equal(body.p_provider_message_id,ids.consumption);assert.equal(body.p_reported_cost_cop,39);
    row={...row,state:'accepted',canSend:false};return json(row);
   }
  }
  if(u.origin==='https://challenges.cloudflare.com'&&u.pathname==='/turnstile/v0/siteverify'){counts.captcha++;return json({success:true,hostname:'registro.crediteksas.com',action:'registro-cliente'});}
  if(u.origin==='https://api.inalambria.express'&&u.pathname==='/v1/messages/send'){
   counts.provider++;assert.equal(request.headers.get('authorization'),'Bearer '+bindings.INALAMBRIA_SMS_API_KEY);const body=await request.json();assert.deepEqual(body.recipients,['+573000000000']);assert.equal(body.async,false);assert.match(body.content,/^Creditek: tu codigo es \d{6}\. Vence en 5 minutos\. No lo compartas\.$/);
   return json({ok:true,consumptionId:ids.consumption,messages:1,credits:1,amount:39,currency:'COP'});
  }
  counts.unexpected++;return json({error:'MOCK_DESTINATION_BLOCKED'},503);
 };
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:source,compatibilityDate:'2026-01-15',compatibilityFlags:['nodejs_compat'],bindings,cf:false,outboundService}));
 try{
  const post=async(path,body)=>{const r=await mf.dispatchFetch('https://registro.crediteksas.com'+path,{method:'POST',headers:{'content-type':'application/json',origin:'https://registro.crediteksas.com'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  const context={enlace_token:'synthetic-registration-token-at-least32',celular:'3000000000'};
  const options=await post('/api/otp/opciones',context);assert.equal(options.status,200);assert.equal(options.body.smsEnabled,label==='candidate');assert.equal(counts.options,label==='candidate'?1:0);assert.equal(counts.context,1);assert.equal(counts.unexpected,0);
  checks.push({label,endpoint:'POST /api/otp/opciones',passed:true,httpStatus:options.status,smsEnabled:options.body.smsEnabled,rpcCalls:counts.options});
  if(label==='candidate'){
   const body={...context,cedula:'000000000000',request_id:ids.request,channel:'sms',sms_reason:'no_whatsapp',turnstile_token:'synthetic-captcha'};
   const sent=await post('/api/otp/enviar',body);assert.equal(sent.status,200);assert.equal(sent.body.state,'accepted');assert.equal(sent.body.otp_id,ids.otp);assert.deepEqual({reserve:counts.reserve,provider:counts.provider,finish:counts.finish,captcha:counts.captcha},{reserve:1,provider:1,finish:1,captcha:1});
   const replay=await post('/api/otp/enviar',body);assert.equal(replay.status,200);assert.equal(replay.body.state,'accepted');assert.equal(counts.provider,1);assert.equal(counts.reserve,1);assert.equal(counts.captcha,1);assert.equal(counts.unexpected,0);
   checks.push({label,endpoint:'POST /api/otp/enviar + identical replay',passed:true,httpStatus:sent.status,state:sent.body.state,deliveryClaimed:false,counts});
  }
 }finally{await mf.dispose();}
}
const receipt={engine:'Complete deployed bundle in real workerd/Miniflare; closed outboundService, synthetic bindings only',baselineSha256:sha(baseline),candidateSha256:sha(candidate),tests:checks.length,passed:checks.length,failed:0,checks,realProviderCalls:0,productionWrites:0};
await writeFile(new URL('./workerd-bundle-receipt.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));

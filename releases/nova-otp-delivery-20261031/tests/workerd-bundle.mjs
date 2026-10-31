import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Miniflare,Response as MFResponse,convertV4MiniflareOptions} from '/Users/oscarm/.npm/_npx/2fea031b5bd76b2e/node_modules/miniflare/dist/src/index.js';
const root=new URL('../',import.meta.url),checks=[],link='10000000-0000-4000-8000-000000000001',otp='20000000-0000-4000-8000-000000000001',provider='wamid.SYNTHETIC_META_000001',phone='3000000000';
const json=(x,status=200)=>new MFResponse(JSON.stringify(x),{status,headers:{'content-type':'application/json'}});
const now=Date.now();
const baseRow={found:true,registered:true,otpId:otp,providerMessageId:provider,createdAt:new Date(now-10000).toISOString(),expiresAt:new Date(now+280000).toISOString(),acceptedAt:new Date(now-9000).toISOString(),state:'accepted',errorCode:null,eventAt:new Date(now-9000).toISOString(),checkedAt:new Date(now-9000).toISOString(),verified:false,consumed:false,expired:false,retryAfter:280};
const clients=await fs.readFile(new URL('deploy/clientes/index.mjs',root),'utf8'),nova=await fs.readFile(new URL('deploy/nova/index.mjs',root),'utf8');
let novaReads=0;
const novaMf=new Miniflare(convertV4MiniflareOptions({modules:true,script:nova,compatibilityDate:'2026-08-30',compatibilityFlags:['nodejs_compat'],bindings:{SUPABASE_URL:'https://ditiwpndvmyuqcagupea.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-key',NOVA_REGISTRATION_INTAKE_TOKEN:'synthetic-intake'},cf:false,outboundService:async req=>{
 const u=new URL(req.url);assert.equal(u.hostname,'ditiwpndvmyuqcagupea.supabase.co');assert.equal(u.pathname,'/rest/v1/sofia_delivery_events');assert.equal(u.searchParams.get('message_id'),'eq.'+provider);assert.equal(u.searchParams.get('recipient'),'eq.57'+phone);novaReads++;
 return json([{message_id:provider,recipient:'57'+phone,status:'failed',event_at:new Date(now-5000).toISOString(),error_code:'131026',evidence_source:'signed_webhook'}]);
}}));
try{
 const body={providerMessageId:provider,recipient:'57'+phone,createdAt:baseRow.createdAt},url='https://nova.internal/internal/client-otp-receipt';
 const bad=await novaMf.dispatchFetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(bad.status,401);assert.equal(novaReads,0);checks.push('NOVA unauthenticated internal request denied without database access');
 const good=await novaMf.dispatchFetch(url,{method:'POST',headers:{authorization:'Bearer synthetic-intake','content-type':'application/json'},body:JSON.stringify(body)}),receipt=await good.json();assert.equal(good.status,200);assert.equal(receipt.state,'failed');assert.equal(receipt.errorCode,'131026');assert.equal(novaReads,1);checks.push('NOVA full deployed bundle returns exact-ID signed rejection only');
}finally{await novaMf.dispose();}

let row={...baseRow},active=true,unknownLink=false;const counts={graph:0,sms:0,reserve:0,register:0,apply:0,captcha:0,verify:0,status:0,service:0,unexpected:0};
const wrapped=clients.replace('index_default3 as default,','index_default3 as originalForTest,')+`\nexport default {fetch(request,env,ctx){return index_default3.fetch(request,{...env,NOVA_QUALITY_LIMIT:{limit:async()=>({success:true})},NOVA_REGISTRATION:{fetch:(url,init)=>fetch('https://nova-mock.invalid/internal/client-otp-receipt',init)}},ctx);}};\n`;
assert.notEqual(wrapped,clients);
const bindings={PHONE_NUMBER_ID:'123456789012',WHATSAPP_TOKEN:'synthetic-wa-token',NOVA_SMS_ENABLED:'true',INALAMBRIA_SMS_API_KEY:'sk_test_synthetic_not_real',SUPABASE_SERVICE_KEY:'synthetic-key',TOKEN_HASH_SECRET:'synthetic-hash-key',TURNSTILE_SECRET_KEY:'synthetic-captcha-key',NOVA_REGISTRATION_INTAKE_TOKEN:'synthetic-intake',ALLOW_LEGACY_REGISTRATION_LINKS:'false'};
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:wrapped,compatibilityDate:'2026-01-15',compatibilityFlags:['nodejs_compat'],bindings,cf:false,outboundService:async req=>{
 const u=new URL(req.url),p=u.pathname;
 if(u.hostname==='nova-mock.invalid'){
  counts.service++;assert.equal(req.headers.get('authorization'),'Bearer synthetic-intake');const b=await req.json();assert.deepEqual(b,{providerMessageId:provider,recipient:'57'+phone,createdAt:row.createdAt});
  return json({ok:true,found:true,providerMessageId:provider,state:'failed',eventAt:new Date(Date.parse(row.createdAt)+1000).toISOString(),errorCode:'131026'});
 }
 if(u.hostname==='challenges.cloudflare.com'){counts.captcha++;return json({success:true,hostname:'registro.crediteksas.com',action:'registro-cliente'});}
 if(u.hostname==='graph.facebook.com'){counts.graph++;const b=await req.json();assert.equal(b.to,'57'+phone);assert.equal(b.type,'template');return json({messages:[{id:provider}]});}
 if(u.hostname==='api.inalambria.express'){counts.sms++;return json({error:'UNEXPECTED_SMS'},500);}
 if(u.hostname.endsWith('.supabase.co')){
  if(p==='/rest/v1/enlaces_registro')return json(unknownLink?[]:[{id:link,origen_codigo:'CK-09',captador_id:null}]);
  if(p==='/rest/v1/origenes')return json([{codigo:'CK-09',nombre:'TIENDA SINTETICA'}]);
  if(p==='/rest/v1/captadores')return json([]);
  if(p==='/rest/v1/rpc/nova_client_otp_options')return json({smsEnabled:false});
  if(p==='/rest/v1/rpc/nova_otp_delivery_read'){counts.status++;return json(active?row:{found:false});}
  if(p==='/rest/v1/rpc/nova_otp_delivery_apply'){counts.apply++;const b=await req.json();assert.equal(b.p_otp_id,otp);assert.equal(b.p_provider_message_id,provider);assert.equal(b.p_state,'failed');row={...row,state:'failed',errorCode:'131026'};return json({applied:true,otpId:otp,providerMessageId:provider,state:'failed',errorCode:'131026'});}
  if(p==='/rest/v1/rpc/nova_otp_delivery_register'){counts.register++;const b=await req.json();assert.equal(b.p_provider_message_id,provider);assert.equal(b.p_otp_id,otp);active=true;row={...baseRow,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+300000).toISOString()};return json(row);}
  if(p==='/rest/v1/rpc/reservar_otp_registro_seguro'){counts.reserve++;return json([{otp_id:otp}]);}
  if(p==='/rest/v1/rpc/nova_client_otp_status')return json({found:false});
  if(p==='/rest/v1/rpc/nova_client_otp_reserve')return json({message:'SMS_DISABLED'},400);
  if(p==='/rest/v1/otp_codigos'){
   if(u.searchParams.get('select')==='id,codigo_hash,intentos'){counts.verify++;return json([]);}
   return json(active?[{id:otp,expira_at:row.expiresAt,intentos:0,envio_aceptado_at:row.acceptedAt,envio_fallido_at:null}]:[]);
  }
 }
 counts.unexpected++;counts.unexpectedPaths=[...(counts.unexpectedPaths||[]),u.hostname+u.pathname];return json({error:'CLOSED_MOCK_UNEXPECTED_DESTINATION'},500);
}}));
const context={enlace_token:'synthetic-registration-token-long-enough',cedula:'000000000000',celular:phone};
const post=async(path,b)=>{const r=await mf.dispatchFetch('https://creditek-clientes.comercial-853.workers.dev'+path,{method:'POST',headers:{'content-type':'application/json',origin:'https://registro.crediteksas.com'},body:JSON.stringify(b)});return {status:r.status,body:await r.json()};};
try{
 const status=await post('/api/otp/estado-whatsapp',context);assert.equal(status.status,200,JSON.stringify({status,counts}));assert.equal(status.body.state,'failed');assert.equal(status.body.error_code,'131026');assert.ok(!JSON.stringify(status.body).includes(provider));assert.equal(counts.graph,0);assert.equal(counts.sms,0);checks.push('CLIENTES full bundle synchronizes signed failure and returns safe public state without sends');
 const before=counts.status;unknownLink=true;assert.equal((await post('/api/otp/estado-whatsapp',context)).status,404);assert.equal(counts.status,before);unknownLink=false;checks.push('Invalid link returns exactly404 without access to status data');
 const verify=await post('/api/otp/verificar',{...context,codigo:'000000'});assert.equal(verify.status,400);assert.equal(verify.body.state,'failed');assert.equal(counts.verify,0);checks.push('Failed exact-code delivery blocks verification before reading code hash');
 active=false;const send=await post('/api/otp/enviar',{...context,turnstile_token:'synthetic-captcha'});assert.equal(send.status,200,JSON.stringify({send,counts}));assert.equal(send.body.state,'accepted');assert.equal(send.body.delivery_confirmed,false);assert.equal(counts.graph,1);assert.equal(counts.reserve,1);assert.equal(counts.register,1);checks.push('Secure WhatsApp creates one reservation, sends once, and persists the exact Meta ID');
 const replay=await post('/api/otp/enviar',{...context,turnstile_token:'synthetic-captcha'});assert.equal(replay.status,502);assert.equal(replay.body.state,'failed');assert.equal(counts.graph,1);assert.equal(counts.reserve,1);checks.push('Recovery of rejected active attempt returns failed without a second provider send');
 const options=await post('/api/otp/opciones',context);assert.equal(options.body.smsEnabled,false);
 const sms=await post('/api/otp/enviar',{...context,turnstile_token:'synthetic-captcha',request_id:'30000000-0000-4000-8000-000000000001',channel:'sms',sms_reason:'no_whatsapp'});assert.equal(sms.status,429);assert.equal(counts.sms,0);checks.push('SMS remains unavailable and no SMS provider call is made');
 assert.equal(counts.unexpected,0);
}finally{await mf.dispose();}
const receipt={engine:'Complete candidate bundles in real workerd/Miniflare, closed outbound mocks and synthetic bindings only',checks,tests:checks.length,passed:checks.length,counts,realMessages:0,productionWrites:0};await fs.writeFile(new URL('tests/workerd-receipt.json',root),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));

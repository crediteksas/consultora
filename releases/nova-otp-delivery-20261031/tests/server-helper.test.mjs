import test from 'node:test';
import assert from 'node:assert/strict';
import {readDeliveryJson} from '../server/common.mjs';
import {createNovaOtpReceiptBridge} from '../server/nova-receipt.mjs';
import {createClientOtpDelivery,publicDeliveryState} from '../server/client-delivery.mjs';
import {sendTrackedWhatsappOtp} from '../server/send-whatsapp.mjs';

// Closed synthetic fixtures only. No provider, database, service binding or network is real.
const NOW=Date.parse('2026-10-31T17:00:00.000Z');
const CREATED='2026-10-31T16:59:58.000Z',EXPIRES='2026-10-31T17:04:58.000Z';
const OTP='11111111-1111-4111-8111-111111111111';
const LINK='22222222-2222-4222-8222-222222222222';
const OTHER_OTP='33333333-3333-4333-8333-333333333333';
const MID='wamid.SYNTHETIC_MESSAGE_000001',OTHER_MID='wamid.SYNTHETIC_MESSAGE_000002';
const PHONE='3000000000',RECIPIENT='573000000000',DOCUMENT='1000000000';
const SECRET='SYNTHETIC_INTERNAL_ONLY',DBKEY='sb_secret_SYNTHETIC_DB_ONLY';
const INPUT={enlace_token:'SYNTHETIC_LINK_'.repeat(4),cedula:DOCUMENT,celular:PHONE};
const BASE_ENV={NOVA_REGISTRATION_INTAKE_TOKEN:SECRET,SUPABASE_URL:'https://ditiwpndvmyuqcagupea.supabase.co',SUPABASE_SERVICE_ROLE_KEY:DBKEY};
const row=(extra={})=>({found:true,otpId:OTP,createdAt:CREATED,expiresAt:EXPIRES,verified:false,consumed:false,registered:true,state:'accepted',providerMessageId:MID,errorCode:null,...extra});
const event=(extra={})=>({message_id:MID,recipient:RECIPIENT,status:'delivered',event_at:'2026-10-31T16:59:59.000Z',error_code:null,evidence_source:'signed_webhook',...extra});
const request=(body={},extra={})=>new Request('https://closed.invalid/status',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+SECRET},body:JSON.stringify(body),...extra});
const bridgeBody=(extra={})=>({providerMessageId:MID,recipient:RECIPIENT,createdAt:CREATED,...extra});
const receipt=(extra={})=>({ok:true,found:true,providerMessageId:MID,state:'delivered',eventAt:'2026-10-31T16:59:59.000Z',errorCode:null,...extra});
function bridgeFixture(rows=[event()],options={}){
 const calls=[];
 const fetcher=async(url,init)=>{calls.push({url:new URL(url),init});return options.response?options.response():Response.json(rows);};
 const handle=createNovaOtpReceiptBridge({equal:async(a,b)=>a===b,fetcher,now:()=>NOW});
 return {calls,handle:(body=bridgeBody(),env=BASE_ENV,extra={})=>handle(request(body,extra),env)};
}
function clientFixture(options={}){
 const rpcCalls=[],serviceCalls=[],limitCalls=[],resolveCalls=[];
 const initial=options.row??row();
 const rpc=async(name,args,env)=>{rpcCalls.push({name,args,env});if(options.rpc)return options.rpc(name,args,env);return {ok:true,value:name==='nova_otp_delivery_apply'?row({state:options.receipt?.state??'delivered',errorCode:options.receipt?.errorCode??null}):initial};};
 const resolveContext=async(...args)=>{resolveCalls.push(args);return options.context??{ok:true,enlaceId:LINK};};
 const env={NOVA_REGISTRATION_INTAKE_TOKEN:SECRET,NOVA_QUALITY_LIMIT:{limit:async args=>{limitCalls.push(args);return {success:options.allowed!==false};}},NOVA_REGISTRATION:{fetch:async(url,init)=>{serviceCalls.push({url,init});return options.serviceResponse?options.serviceResponse():Response.json(options.receipt??receipt());}}};
 const api=createClientOtpDelivery({rpc,resolveContext,fetcher:async()=>{throw Error('No outgoing network authorized in test');},now:()=>NOW});
 return {api,env,rpcCalls,serviceCalls,limitCalls,resolveCalls,handle:input=>api.handle(request(input??INPUT),env)};
}
function assertPublicNoPrivate(body){
 const text=JSON.stringify(body);for(const value of [PHONE,RECIPIENT,DOCUMENT,SECRET,DBKEY,INPUT.enlace_token,MID,OTHER_MID,'654321'])assert.equal(text.includes(value),false,'public response leaked fixture: '+value);
 // The opaque OTP UUID correlates a status response to one request; it is not an OTP code.
 if('attempt_id' in body)assert.equal(body.attempt_id,OTP);
}

test('unauthorized bridge requests and non-POST requests perform zero database reads',async()=>{
 for(const auth of [undefined,'Bearer wrong','Basic '+SECRET,'Bearer '+SECRET+' extra']){
  const f=bridgeFixture(),headers={'content-type':'application/json'};if(auth)headers.authorization=auth;
  const r=await f.handle(bridgeBody(),BASE_ENV,{headers});assert.equal(r.status,401);assert.equal(f.calls.length,0);assert.deepEqual(await r.json(),{ok:false});
 }
 const f=bridgeFixture(),r=await f.handle(bridgeBody(),BASE_ENV,{method:'GET',body:undefined});assert.equal(r.status,405);assert.equal(f.calls.length,0);
});

test('bridge request and database configuration are validated before database access',async()=>{
 for(const body of [null,[],bridgeBody({recipient:PHONE}),bridgeBody({providerMessageId:'bad'}),bridgeBody({createdAt:new Date(NOW+1001).toISOString()}),bridgeBody({createdAt:new Date(NOW-86400001).toISOString()})]){
  const f=bridgeFixture(),r=await f.handle(body);assert.equal(r.status,400);assert.equal(f.calls.length,0);
 }
 for(const env of [{...BASE_ENV,SUPABASE_URL:'https://other.invalid'},{...BASE_ENV,SUPABASE_SERVICE_ROLE_KEY:''}]){
  const f=bridgeFixture(),r=await f.handle(bridgeBody(),env);assert.equal(r.status,503);assert.equal(f.calls.length,0);
 }
});

test('bridge query binds exact Meta ID, recipient, signed source and bounded event times',async()=>{
 const f=bridgeFixture(),r=await f.handle();assert.equal(r.status,200);const b=await r.json();assert.equal(b.state,'delivered');assert.equal(b.found,true);
 assert.equal(f.calls.length,1);const {url,init}=f.calls[0];assert.equal(url.origin,'https://ditiwpndvmyuqcagupea.supabase.co');assert.equal(url.pathname,'/rest/v1/sofia_delivery_events');
 assert.equal(url.searchParams.get('message_id'),'eq.'+MID);assert.equal(url.searchParams.get('recipient'),'eq.'+RECIPIENT);assert.equal(url.searchParams.get('evidence_source'),'eq.signed_webhook');
 assert.equal(url.searchParams.get('event_at'),'gte.2026-10-31T16:59:57.000Z');assert.equal(url.searchParams.get('and'),'(event_at.lte.2026-10-31T17:01:00.000Z)');
 assert.equal(url.searchParams.get('limit'),'65');assert.equal(init.redirect,'manual');assert.ok(init.signal instanceof AbortSignal);assert.equal(init.headers.apikey,DBKEY);assert.equal(init.headers.authorization,undefined);
 assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(JSON.stringify(b).includes(RECIPIENT),false);assert.equal(JSON.stringify(b).includes(DBKEY),false);
});

test('bridge rejects any mismatched or unauthenticated evidence instead of using it',async()=>{
 for(const bad of [{message_id:OTHER_MID},{recipient:'573000000001'},{evidence_source:'send_api'},{status:'accepted'},{event_at:'2026-10-31T16:59:56.999Z'},{event_at:'2026-10-31T17:01:00.001Z'},{event_at:'invalid'},{error_code:'PRIVATE_REASON'},{error_code:undefined}]){
  const f=bridgeFixture([event(bad)]),r=await f.handle();assert.equal(r.status,503,JSON.stringify(bad));const b=await r.json();assert.deepEqual(b,{ok:false,error:'RECEIPT_UNAVAILABLE'});assertPublicNoPrivate(b);
 }
});

test('bridge preserves failure precedence independently of webhook arrival ordering',async()=>{
 const events=[event({status:'read'}),event({status:'failed',error_code:131026,event_at:CREATED}),event({status:'delivered',event_at:'2026-10-31T17:00:00.000Z'})];
 for(const rows of [events,[...events].reverse()]){const f=bridgeFixture(rows),r=await f.handle(),b=await r.json();assert.equal(b.state,'failed');assert.equal(b.errorCode,'131026');}
 const f=bridgeFixture([event({status:'sent'}),event({status:'read'}),event({status:'delivered'})]);assert.equal((await (await f.handle()).json()).state,'read');
});

test('bridge returns found:false for no evidence and refuses over-limit rows',async()=>{
 const empty=bridgeFixture([]),r=await empty.handle();assert.deepEqual(await r.json(),{ok:true,found:false});
 const excess=bridgeFixture(Array.from({length:65},()=>event()));assert.equal((await excess.handle()).status,503);
});

test('bridge does not follow redirects or expose provider bodies on errors',async()=>{
 for(const status of [302,307,401,403,500]){const f=bridgeFixture([],{response:()=>new Response('PRIVATE '+DBKEY,{status,headers:{location:'https://do-not-follow.invalid/'}})}),r=await f.handle();assert.equal(r.status,503);assert.equal(f.calls.length,1);assert.equal(f.calls[0].init.redirect,'manual');assertPublicNoPrivate(await r.json());}
});

test('delivery JSON reader enforces header and streaming body bounds and UTF-8 validity',async()=>{
 await assert.rejects(()=>readDeliveryJson(new Response('{}',{headers:{'content-length':'16385'}})),/BODY_LIMIT/);
 await assert.rejects(()=>readDeliveryJson(new Response('x'.repeat(16385))),/BODY_LIMIT/);
 await assert.rejects(()=>readDeliveryJson(new Response(null)),/BODY_LIMIT/);
 await assert.rejects(()=>readDeliveryJson(new Response(new Uint8Array([0xff,0xfe]))));
 assert.deepEqual(await readDeliveryJson(Response.json({ok:true})),{ok:true});
});

test('bridge body-size limit fails closed with no reads and does not echo request data',async()=>{
 const f=bridgeFixture(),r=await f.handle({...bridgeBody(),private:'x'.repeat(2100)});assert.equal(r.status,503);assert.equal(f.calls.length,0);assertPublicNoPrivate(await r.json());
 const bad=bridgeFixture([],{response:()=>new Response('PRIVATE'+SECRET+'x'.repeat(17000))});assert.equal((await bad.handle()).status,503);
});

test('client context rejection returns before rate limiting, SQL and service access',async()=>{
 const f=clientFixture({context:{ok:false,response:{status:404,body:{ok:false,error:'Enlace no vigente'}}}}),r=await f.handle();assert.equal(r.status,404);assert.equal(f.rpcCalls.length,0);assert.equal(f.serviceCalls.length,0);assert.equal(f.limitCalls.length,0);
 for(const input of [{...INPUT,cedula:'bad'},{...INPUT,celular:'123'},{...INPUT,enlace_token:'short'}]){const invalid=clientFixture(),r=await invalid.handle(input);assert.equal(r.status,400);assert.equal(invalid.resolveCalls.length,0);assert.equal(invalid.rpcCalls.length,0);}
});

test('client rate limit blocks SQL and service access and stores only a hash in the limiter key',async()=>{
 const f=clientFixture({allowed:false}),r=await f.handle();assert.equal(r.status,429);assert.equal(f.rpcCalls.length,0);assert.equal(f.serviceCalls.length,0);assert.equal(f.limitCalls.length,1);
 const key=f.limitCalls[0].key;assert.match(key,/^otp-delivery:[a-f0-9]{64}$/);for(const value of [PHONE,DOCUMENT,INPUT.enlace_token,LINK])assert.equal(key.includes(value),false);assertPublicNoPrivate(await r.json());
});

test('client missing limiter fails closed without reading delivery or sending any code',async()=>{
 const f=clientFixture();delete f.env.NOVA_QUALITY_LIMIT;const r=await f.handle();assert.equal(r.status,503);assert.equal(f.rpcCalls.length,0);assert.equal(f.serviceCalls.length,0);assertPublicNoPrivate(await r.json());
});

test('client binds status read and receipt application to resolved identity and exact OTP/Meta IDs',async()=>{
 const f=clientFixture(),r=await f.handle(),b=await r.json();assert.equal(r.status,200);assert.equal(b.state,'delivered');assert.equal(b.delivery_confirmed,true);assert.equal(b.attempt_id,OTP);assertPublicNoPrivate(b);
 assert.deepEqual(f.rpcCalls.map(x=>x.name),['nova_otp_delivery_read','nova_otp_delivery_apply']);assert.deepEqual(f.rpcCalls[0].args,{p_cedula:DOCUMENT,p_celular:PHONE,p_enlace_registro_id:LINK,p_otp_id:null});
 assert.deepEqual(f.rpcCalls[1].args,{p_otp_id:OTP,p_provider_message_id:MID,p_state:'delivered',p_event_at:'2026-10-31T16:59:59.000Z',p_error_code:null});
 assert.equal(f.serviceCalls.length,1);const c=f.serviceCalls[0];assert.equal(c.url,'https://nova.internal/internal/client-otp-receipt');assert.equal(c.init.method,'POST');assert.deepEqual(JSON.parse(c.init.body),{providerMessageId:MID,recipient:RECIPIENT,createdAt:CREATED});assert.equal(c.init.headers.authorization,'Bearer '+SECRET);
});

test('client known attempt UUID is propagated to SQL and returned as opaque correlation only',async()=>{
 const f=clientFixture(),r=await f.handle({...INPUT,attempt_id:OTP}),b=await r.json();
 assert.equal(r.status,200);assert.equal(b.state,'delivered');assert.equal(b.attempt_id,OTP);assertPublicNoPrivate(b);
 assert.deepEqual(f.rpcCalls[0].args,{p_cedula:DOCUMENT,p_celular:PHONE,p_enlace_registro_id:LINK,p_otp_id:OTP});
 assert.equal(f.serviceCalls.length,1);assert.equal(JSON.parse(f.serviceCalls[0].init.body).providerMessageId,MID);
});

test('client known attempt rejects a different returned OTP before service lookup or application',async()=>{
 const f=clientFixture({row:row({otpId:OTHER_OTP})}),r=await f.handle({...INPUT,attempt_id:OTP}),b=await r.json();
 assert.equal(r.status,503);assert.equal(b.state,'uncertain');assert.equal(b.ok,false);assert.equal(f.rpcCalls.length,1);assert.equal(f.rpcCalls[0].args.p_otp_id,OTP);assert.equal(f.serviceCalls.length,0);assert.equal(JSON.stringify(b).includes(OTHER_OTP),false);assertPublicNoPrivate(b);
});

test('client malformed attempt UUID causes no context lookup, SQL, limiter or service access',async()=>{
 for(const attempt_id of ['not-a-uuid',MID,'',123,'00000000-0000-0000-0000-000000000000']){
  const f=clientFixture(),r=await f.handle({...INPUT,attempt_id}),b=await r.json();
  assert.equal(r.status,400);assert.equal(f.resolveCalls.length,0);assert.equal(f.rpcCalls.length,0);assert.equal(f.limitCalls.length,0);assert.equal(f.serviceCalls.length,0);assertPublicNoPrivate(b);
 }
});

test('client rejects receipt context/time mismatches without application or automatic sends',async()=>{
 for(const invalid of [{providerMessageId:OTHER_MID},{eventAt:'2026-10-31T16:59:56.999Z'},{eventAt:'2026-10-31T17:01:00.001Z'},{state:'accepted'},{errorCode:'PRIVATE'}]){
  const f=clientFixture({receipt:receipt(invalid)}),b=await (await f.handle()).json();assert.equal(b.state,'accepted');assert.equal(b.delivery_confirmed,false);assert.deepEqual(f.rpcCalls.map(x=>x.name),['nova_otp_delivery_read']);assert.equal(f.serviceCalls.length,1);assertPublicNoPrivate(b);
 }
});

test('client confirmed failure hides the code flow even when persistence is unavailable',async()=>{
 const failed=receipt({state:'failed',errorCode:'131026'});
 for(const badApply of [{ok:false},{ok:true,value:row({otpId:OTHER_OTP,state:'failed'})},{ok:true,value:row({providerMessageId:OTHER_MID,state:'failed'})}]){
  const f=clientFixture({receipt:failed,rpc:async name=>name==='nova_otp_delivery_read'?{ok:true,value:row()}:badApply}),r=await f.handle(),b=await r.json();assert.equal(r.status,200);assert.equal(b.ok,false);assert.equal(b.state,'failed');assert.equal(b.error_code,'131026');assertPublicNoPrivate(b);assert.equal(f.serviceCalls.length,1);
 }
});

test('client never loses a bound failed receipt when apply throws or contradicts that failure',async()=>{
 for(const apply of [async()=>{throw Error('PRIVATE SQL transport');},async()=>({ok:true,value:row({state:'accepted'})})]){
  const f=clientFixture({receipt:receipt({state:'failed',errorCode:'131026'}),rpc:async name=>name==='nova_otp_delivery_read'?{ok:true,value:row()}:apply()});
  const r=await f.handle(),b=await r.json();assert.equal(r.status,200);assert.equal(b.state,'failed');assert.equal(b.ok,false);assert.equal(b.error_code,'131026');assertPublicNoPrivate(b);assert.equal(f.serviceCalls.length,1);
 }
});

test('client delivery lookup failures never claim delivered, send again, or return private diagnostics',async()=>{
 for(const response of [()=>new Response('PRIVATE '+SECRET,{status:503}),()=>new Response('x'.repeat(2049)),()=>new Response('{bad'),()=>Response.json({ok:true,found:false})]){
  const f=clientFixture({serviceResponse:response}),b=await (await f.handle()).json();assert.equal(b.state,'accepted');assert.equal(b.delivery_confirmed,false);assert.equal(f.rpcCalls.length,1);assert.equal(f.serviceCalls.length,1);assertPublicNoPrivate(b);
 }
});

test('client known failure, verified or consumed OTP requires no downstream service lookup',async()=>{
 for(const state of [row({state:'failed',errorCode:'131026'}),row({verified:true}),row({consumed:true}),{found:false}]){
  const f=clientFixture({row:state}),b=await (await f.handle()).json();assert.equal(f.serviceCalls.length,0);assert.equal(f.rpcCalls.length,1);assertPublicNoPrivate(b);
 }
});

test('client rechecks previous read or delivered state and preserves a later signed failure',async()=>{
 for(const state of ['read','delivered']){
  const f=clientFixture({row:row({state}),receipt:receipt({state:'failed',errorCode:'131026'})});
  const r=await f.handle(),b=await r.json();assert.equal(r.status,200);assert.equal(b.state,'failed');assert.equal(b.ok,false);assert.equal(b.error_code,'131026');assert.equal(f.serviceCalls.length,1);assert.deepEqual(f.rpcCalls.map(x=>x.name),['nova_otp_delivery_read','nova_otp_delivery_apply']);assertPublicNoPrivate(b);
 }
});

test('public states distinguish delivery, expire promptly and expose only the opaque attempt UUID',()=>{
 for(const state of ['accepted','sent']){const b=publicDeliveryState(row({state}),NOW);assert.equal(b.delivery_confirmed,false);assert.equal(b.attempt_id,OTP);assertPublicNoPrivate(b);}
 for(const state of ['delivered','read']){const b=publicDeliveryState(row({state}),NOW);assert.equal(b.delivery_confirmed,true);assert.equal(b.attempt_id,OTP);assertPublicNoPrivate(b);}
 const expired=publicDeliveryState(row({expiresAt:new Date(NOW).toISOString()}),NOW);assert.equal(expired.state,'expired');assert.equal(expired.retry_after,0);assert.equal(expired.ok,false);assertPublicNoPrivate(expired);
 const failed=publicDeliveryState(row({state:'failed',errorCode:'131026',expiresAt:new Date(NOW-1000).toISOString()}),NOW);assert.equal(failed.state,'failed');assert.equal(failed.retry_after,0);assert.equal(failed.ok,false);assertPublicNoPrivate(failed);
 assert.equal(publicDeliveryState(row({state:'uncertain'}),NOW).state,'uncertain');
});

test('client register refuses invalid identifiers before SQL and binds all context arguments',async()=>{
 const f=clientFixture();assert.equal(await f.api.register(INPUT,LINK,'bad',MID,f.env),false);assert.equal(await f.api.register(INPUT,LINK,OTP,'bad',f.env),false);assert.equal(f.rpcCalls.length,0);
 assert.equal(await f.api.register(INPUT,LINK,OTP,MID,f.env),true);assert.equal(f.rpcCalls.length,1);assert.equal(f.rpcCalls[0].name,'nova_otp_delivery_register');assert.deepEqual(f.rpcCalls[0].args,{p_cedula:DOCUMENT,p_celular:PHONE,p_enlace_registro_id:LINK,p_otp_id:OTP,p_provider_message_id:MID});assert.equal(f.serviceCalls.length,0);
 for(const value of [row({otpId:OTHER_OTP}),row({providerMessageId:OTHER_MID}),row({registered:false})]){const bad=clientFixture({rpc:async()=>({ok:true,value})});assert.equal(await bad.api.register(INPUT,LINK,OTP,MID,bad.env),false);}
});

test('tracked WhatsApp accepts an exact Meta ID without claiming delivery and makes one call',async()=>{
 let calls=0;const env={PHONE_NUMBER_ID:'1234567890123',WHATSAPP_TOKEN:'SYNTHETIC_META_SECRET'};
 const result=await sendTrackedWhatsappOtp(PHONE,'654321',env,async(url,init)=>{calls++;assert.equal(url,'https://graph.facebook.com/v21.0/1234567890123/messages');assert.equal(init.redirect,'manual');assert.ok(init.signal instanceof AbortSignal);assert.equal(init.headers.authorization,'Bearer '+env.WHATSAPP_TOKEN);const b=JSON.parse(init.body);assert.equal(b.to,RECIPIENT);assert.equal(b.template.name,'codigo_verificacion_creditek');assert.equal(b.template.components[0].parameters[0].text,'654321');return Response.json({messaging_product:'whatsapp',messages:[{id:MID}]});});
 assert.equal(calls,1);assert.deepEqual(result,{state:'accepted',providerMessageId:MID});assert.equal('delivered' in result,false);
});

test('tracked WhatsApp malformed acceptance, redirect, network and timeout remain uncertain without retry',async()=>{
 const env={PHONE_NUMBER_ID:'1234567890123',WHATSAPP_TOKEN:'SYNTHETIC_META_SECRET'};
 for(const make of [()=>Response.json({messages:[]}),()=>Response.json({messages:[{id:'bad'}]}),()=>new Response('{bad'),()=>new Response('x'.repeat(8193)),()=>new Response('',{status:302,headers:{location:'https://never.invalid'}}),()=>new Response('',{status:503}),()=>{throw new TypeError('PRIVATE '+env.WHATSAPP_TOKEN);},()=>{throw new DOMException('PRIVATE','TimeoutError');}]){
  let calls=0;const result=await sendTrackedWhatsappOtp(PHONE,'654321',env,async()=>{calls++;return make();});assert.equal(calls,1);assert.deepEqual(result,{state:'uncertain'});assert.equal(JSON.stringify(result).includes(env.WHATSAPP_TOKEN),false);
 }
});

test('tracked WhatsApp rejects non-array messages, multiple IDs and contradictory error objects',async()=>{
 const env={PHONE_NUMBER_ID:'1234567890123',WHATSAPP_TOKEN:'SYNTHETIC_META_SECRET'};
 const bodies=[{messages:{0:{id:MID}}},{messages:MID},{messages:[{id:MID},{id:OTHER_MID}]},{messages:[{id:MID}],error:{code:131026,message:'PRIVATE provider details'}},{messages:[{id:MID}],error:{}}];
 for(const body of bodies){
  let calls=0;const result=await sendTrackedWhatsappOtp(PHONE,'654321',env,async()=>{calls++;return Response.json(body);});
  assert.equal(calls,1);assert.deepEqual(result,{state:'uncertain'});for(const privateValue of [MID,OTHER_MID,env.WHATSAPP_TOKEN,'PRIVATE provider details','654321'])assert.equal(JSON.stringify(result).includes(privateValue),false);
 }
});

test('tracked WhatsApp invalid input performs no send and 4xx is a closed rejection',async()=>{
 const env={PHONE_NUMBER_ID:'1234567890123',WHATSAPP_TOKEN:'SYNTHETIC_META_SECRET'};let calls=0;
 for(const [phone,code,e] of [['bad','654321',env],[PHONE,'12',env],[PHONE,'654321',{...env,PHONE_NUMBER_ID:'bad'}],[PHONE,'654321',{...env,WHATSAPP_TOKEN:''}]])assert.deepEqual(await sendTrackedWhatsappOtp(phone,code,e,async()=>{calls++;}),{state:'not_sent'});
 assert.equal(calls,0);assert.deepEqual(await sendTrackedWhatsappOtp(PHONE,'654321',env,async()=>new Response('{}',{status:400})),{state:'failed'});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {sendManagedOtp,managedOtpOptions,managedOtpStatus,sendManagedWhatsapp,readManagedOtpBody,managedOtpEnabled} from './managed-otp.mjs';
const requestId='11111111-1111-4111-8111-111111111111',attemptId='22222222-2222-4222-8222-222222222222',otpId='33333333-3333-4333-8333-333333333333';
const now=Date.parse('2026-10-30T17:00:00Z');
const input={enlace_token:'t'.repeat(48),cedula:'10000001',celular:'3000000000',turnstile_token:'synthetic',request_id:requestId,channel:'sms',sms_reason:'no_whatsapp'};
const env={NOVA_SMS_ENABLED:'true',ALLOW_LEGACY_REGISTRATION_LINKS:'false',INALAMBRIA_SMS_API_KEY:'sk_test_synthetic_test_only',PHONE_NUMBER_ID:'123456789012345',WHATSAPP_TOKEN:'synthetic',TOKEN_HASH_SECRET:'synthetic',TURNSTILE_SECRET_KEY:'synthetic'};
const json=(b,status=200)=>new Response(JSON.stringify(b),{status,headers:{'content-type':'application/json'}});
function fixture(overrides={}){
  const events=[];let ledger=null;
  const deps={now:()=>now,supabaseUrl:'https://synthetic.invalid',headers:()=>({'authorization':'Bearer synthetic'}),resolveContext:async()=>{events.push('context');return{ok:true,enlaceId:'44444444-4444-4444-8444-444444444444'};},verifyTurnstile:async()=>{events.push('turnstile');return true;},generateCode:()=>{events.push('generate');return '123456';},hash:async()=>{events.push('hash');return 'H'.repeat(43);},fetcher:async(url,init)=>{
    if(url.startsWith('https://api.inalambria.express')){events.push('provider');if(overrides.transport) return overrides.transport(url,init);return json({ok:true,consumptionId:'55555555-5555-4555-8555-555555555555',messages:1,credits:39,amount:39,currency:'COP'});}
    const name=url.split('/').at(-1),body=JSON.parse(init.body);events.push(name);
    if(overrides.rpc){const custom=await overrides.rpc(name,body);if(custom)return custom;}
    if(name==='nova_client_otp_options')return json({smsEnabled:true,monthlyBudgetCop:3900});
    if(name==='nova_client_otp_status')return json(ledger?{...ledger,found:true}:{found:false});
    if(name==='nova_client_otp_reserve'){ledger={requestId,attemptId,otpId,channel:body.p_channel,state:'reserved',canSend:true,reservedCostCop:body.p_channel==='sms'?39:0,expiresAt:new Date(now+300000).toISOString()};return json(ledger);}
    if(name==='nova_client_otp_finish'){ledger={...ledger,state:body.p_status,canSend:false};return json(ledger);}
    throw Error('Unexpected synthetic URL');
  }};return{deps,events,getLedger:()=>ledger};
}

test('SMS disabled never reserves or sends; guarded legacy availability does not change the feature flag',async()=>{
  const e={...env,NOVA_SMS_ENABLED:'false'},f=fixture();assert.equal(managedOtpEnabled(e),false);assert.equal((await sendManagedOtp(input,null,e,f.deps)).status,503);assert.deepEqual(f.events,[]);assert.deepEqual((await managedOtpOptions(input,e,f.deps)).body,{smsEnabled:false});
  assert.equal(managedOtpEnabled({...env,ALLOW_LEGACY_REGISTRATION_LINKS:'true'}),true);
});
test('SMS explicit reason required; no automatic fallback from WA',async()=>{
  const f=fixture();for(const v of [{...input,sms_reason:undefined},{...input,channel:'telegram'},{...input,channel:'whatsapp'}])assert.equal((await sendManagedOtp(v,null,env,f.deps)).status,400);assert.deepEqual(f.events,[]);
});
test('configuration is checked before reservation, provider only after durable grant',async()=>{
  const f=fixture();const r=await sendManagedOtp(input,null,env,f.deps);assert.equal(r.status,200);assert.deepEqual(r.body,{ok:true,state:'accepted',request_id:requestId,channel:'sms',otp_id:otpId,retry_after:300});assert.deepEqual(f.events,['context','nova_client_otp_status','turnstile','generate','hash','nova_client_otp_reserve','provider','nova_client_otp_finish']);
  const g=fixture();assert.equal((await sendManagedOtp(input,null,{...env,INALAMBRIA_SMS_API_KEY:''},g.deps)).body.state,'not_sent');assert.ok(!g.events.includes('nova_client_otp_reserve'));
});
test('repeating requestId returns existing receipt without generating/sending another OTP',async()=>{
  const f=fixture();await sendManagedOtp(input,null,env,f.deps);f.events.length=0;const replay=await sendManagedOtp(input,null,env,f.deps);assert.equal(replay.body.state,'accepted');assert.deepEqual(f.events,['context','nova_client_otp_status']);
});
test('same UUID different channel cannot change or send',async()=>{
  const f=fixture();await sendManagedOtp(input,null,env,f.deps);f.events.length=0;const r=await sendManagedOtp({...input,channel:'whatsapp',sms_reason:undefined},null,env,f.deps);assert.equal(r.status,409);assert.deepEqual(f.events,['context','nova_client_otp_status']);
});
test('expired request stays expired; new code only with a new UUID',async()=>{
  const f=fixture({rpc:async(name)=>name==='nova_client_otp_status'?json({found:true,requestId,channel:'sms',state:'expired',expiresAt:new Date(now-1).toISOString()}):null});const r=await sendManagedOtp(input,null,env,f.deps);assert.equal(r.body.state,'expired');assert.deepEqual(f.events,['context','nova_client_otp_status']);
});
test('bad Turnstile, revoked link and malformed input cannot reserve',async()=>{
  const f=fixture();f.deps.verifyTurnstile=async()=>false;assert.equal((await sendManagedOtp(input,null,env,f.deps)).status,400);assert.ok(!f.events.includes('provider'));assert.ok(!f.events.includes('nova_client_otp_reserve'));
  f.deps.resolveContext=async()=>({ok:false,response:{status:404,body:{ok:false,error:'Enlace inválido'}}});assert.equal((await sendManagedOtp(input,null,env,f.deps)).status,404);
  assert.equal((await sendManagedOtp({...input,cedula:'oops'},null,env,f.deps)).status,400);
});
test('active challenge blocks cross-channel duplication and reveals no foreign OTP',async()=>{
  const f=fixture({rpc:async n=>n==='nova_client_otp_reserve'?json({message:'OTP_ACTIVE'},400):null});const r=await sendManagedOtp(input,null,env,f.deps);assert.equal(r.status,409);assert.equal(r.body.reason,'active_challenge');assert.equal(r.body.otp_id,undefined);assert.ok(!f.events.includes('provider'));
});
test('limits, cost anomaly and pause are authoritative even when options said enabled',async()=>{
  for(const message of ['SMS_BUDGET_LIMIT','SMS_COST_ANOMALY','SMS_DISABLED','SMS_PHONE_LIMIT','otp_limite_celular']){const f=fixture({rpc:async n=>n==='nova_client_otp_reserve'?json({message},400):null});assert.equal((await sendManagedOtp(input,null,env,f.deps)).body.state,'not_sent');assert.ok(!f.events.includes('provider'));}
});
test('reservation timeout/malformed or no grant never initiates provider request',async()=>{
  for(const response of [()=>{throw Error('timeout');},()=>new Response('oops'),()=>json({requestId,attemptId,otpId,channel:'sms',state:'reserved',canSend:false}),()=>json({requestId:'other',attemptId,otpId,channel:'sms',state:'reserved',canSend:true})]){const f=fixture({rpc:async n=>n==='nova_client_otp_reserve'?response():null});const r=await sendManagedOtp(input,null,env,f.deps);assert.equal(r.status,202);assert.ok(!f.events.includes('provider'));}
});
test('provider timeout/500 is uncertain, keeps original reservation and never falls back to WhatsApp',async()=>{
  for(const transport of [()=>{throw Error('timeout');},()=>new Response('',{status:500})]){const f=fixture({transport});const r=await sendManagedOtp(input,null,env,f.deps);assert.equal(r.status,202);assert.equal(f.getLedger().state,'uncertain');await sendManagedOtp(input,null,env,f.deps);assert.equal(f.events.filter(e=>e==='provider').length,1);}
});
test('provider 4xx failed remains blocked until expiry; no invisible cost release',async()=>{
  const f=fixture({transport:()=>new Response('',{status:429})});const r=await sendManagedOtp(input,null,env,f.deps);assert.equal(r.body.state,'failed');assert.equal(r.body.retry_after,300);await sendManagedOtp(input,null,env,f.deps);assert.equal(f.events.filter(e=>e==='provider').length,1);
});
test('accepted send with receipt-write failure is uncertain; never retries transport',async()=>{
  const f=fixture({rpc:async n=>n==='nova_client_otp_finish'?new Response('',{status:500}):null});assert.equal((await sendManagedOtp(input,null,env,f.deps)).status,202);await sendManagedOtp(input,null,env,f.deps);assert.equal(f.events.filter(e=>e==='provider').length,1);
});
test('status is read only, context bound, with no phone, code, provider id or cost in public body',async()=>{
  const f=fixture();await sendManagedOtp(input,null,env,f.deps);f.events.length=0;const r=await managedOtpStatus(input,env,f.deps);assert.equal(r.body.otp_id,otpId);assert.deepEqual(f.events,['context','nova_client_otp_status']);for(const hidden of [input.cedula,input.celular,'123456','consumptionId','attemptId','CostCop','providerMessage'])assert.ok(!JSON.stringify(r.body).includes(hidden));
});
test('missing or unreadable status remains uncertain, never declares no send based only on absence',async()=>{
  const f=fixture();const r=await managedOtpStatus(input,env,f.deps);assert.equal(r.status,202);assert.equal(r.body.retry_after,300);assert.deepEqual(f.events,['context','nova_client_otp_status']);
});
test('verified challenge never authorizes another OTP or fabricates registration session',async()=>{
  const f=fixture({rpc:async n=>n==='nova_client_otp_status'?json({found:true,requestId,channel:'sms',state:'verified',expiresAt:new Date(now+100000).toISOString()}):null});const r=await sendManagedOtp(input,null,env,f.deps);assert.equal(r.status,409);assert.equal(r.body.registro_session,undefined);assert.ok(!f.events.includes('provider'));
});
test('options exposes only boolean, no credentials or internal budget',async()=>{
  const f=fixture();assert.deepEqual((await managedOtpOptions(input,env,f.deps)).body,{smsEnabled:true});assert.deepEqual(f.events,['context','nova_client_otp_options']);
});
test('managed WhatsApp retains template contract and distinguishes uncertain from failure',async()=>{
  let body;const accepted=await sendManagedWhatsapp('3000000000','123456',env,async(u,init)=>{body=JSON.parse(init.body);return json({messages:[{id:'wamid.synthetic'}]});});assert.equal(accepted.status,'accepted');assert.equal(body.to,'573000000000');assert.equal(body.template.name,'codigo_verificacion_creditek');assert.equal(body.template.language.code,'es_CO');assert.equal(body.template.components[1].parameters[0].text,'123456');
  assert.equal((await sendManagedWhatsapp('3000000000','123456',env,async()=>new Response('',{status:500}))).status,'uncertain');assert.equal((await sendManagedWhatsapp('3000000000','123456',env,async()=>new Response('',{status:400}))).status,'failed');assert.equal((await sendManagedWhatsapp('3000000000','123456',env,async()=>json({messages:[]}))).status,'uncertain');
});
test('JSON input has bounded size/type before parse',async()=>{
  await assert.rejects(()=>readManagedOtpBody(new Request('https://test.invalid',{method:'POST',body:'{}'})));
  await assert.rejects(()=>readManagedOtpBody(new Request('https://test.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({x:'a'.repeat(5000)})})));
  assert.deepEqual(await readManagedOtpBody(new Request('https://test.invalid',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})),{});
});
test('mismatched budget reservation never spends; records failure with retained reservation',async()=>{
  let receipt;
  const f=fixture({rpc:async(n,b)=>{
    if(n==='nova_client_otp_reserve')return json({requestId,attemptId,otpId,channel:'sms',state:'reserved',canSend:true,reservedCostCop:1,expiresAt:new Date(now+300000).toISOString()});
    if(n==='nova_client_otp_finish'){receipt=b;return json({requestId,attemptId,otpId,channel:'sms',state:'failed',expiresAt:new Date(now+300000).toISOString()});}
  }});
  const r=await sendManagedOtp(input,null,env,f.deps);assert.equal(r.body.state,'failed');assert.equal(receipt.p_error_code,'OTP_RESERVATION_COST_MISMATCH');assert.ok(!f.events.includes('provider'));
});
test('OTP expires while waiting for reservation: do not send expired code or extend TTL in UI',async()=>{
  let clock=now,receipt;
  const f=fixture({rpc:async(n,b)=>{
    if(n==='nova_client_otp_reserve'){clock=now+300001;return json({requestId,attemptId,otpId,channel:'sms',state:'reserved',canSend:true,reservedCostCop:39,expiresAt:new Date(now+300000).toISOString()});}
    if(n==='nova_client_otp_finish'){receipt=b;return json({requestId,attemptId,otpId,channel:'sms',state:'failed',expiresAt:new Date(now+300000).toISOString()});}
  }});f.deps.now=()=>clock;
  const r=await sendManagedOtp(input,null,env,f.deps);assert.equal(r.body.state,'expired');assert.equal(r.body.retry_after,0);assert.equal(receipt.p_error_code,'OTP_EXPIRED_BEFORE_SEND');assert.ok(!f.events.includes('provider'));
});
test('pilot options passes only a validated phone or NULL to SQL; public capability contains no phone',async()=>{
  for(const phone of ['3000000000',undefined,'not-a-phone',3000000000]){
    let args;const f=fixture({rpc:async(n,b)=>{if(n==='nova_client_otp_options'){args=b;return json({smsEnabled:typeof phone==='string'&&phone==='3000000000'});}}});
    const r=await managedOtpOptions({...input,celular:phone},env,f.deps);assert.equal(args.p_celular,phone==='3000000000'?phone:null);assert.deepEqual(Object.keys(r.body),['smsEnabled']);assert.ok(!JSON.stringify(r.body).includes('3000000000'));
  }
});
test('wrong pilot phone is rejected by SQL before OTP/ledger creation or any transport; no automatic WA fallback',async()=>{
  const f=fixture({rpc:async n=>n==='nova_client_otp_reserve'?json({message:'SMS_PILOT_LIMITED'},400):null});const r=await sendManagedOtp(input,null,env,f.deps);assert.equal(r.status,403);assert.equal(r.body.state,'not_sent');assert.equal(r.body.retry_after,0);assert.ok(!f.events.includes('provider'));assert.equal(f.getLedger(),null);
});

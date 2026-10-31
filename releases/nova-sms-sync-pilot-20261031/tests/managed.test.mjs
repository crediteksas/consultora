import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,input,ids,baseline} from './fixture.mjs';
const check=(name,options,fn)=>test(name,async()=>{const f=await fixture(options);try{await fn(f);}finally{await f.close();}});
check('valid provider key with SQL policy off reserves nothing and makes no provider call',{enabled:false},async f=>{
 assert.deepEqual(JSON.parse(JSON.stringify((await f.options()).body)),{smsEnabled:false});const result=await f.send();assert.equal(result.body.state,'not_sent');assert.equal(f.counts.provider,0);assert.equal((await f.ledger()).length,0);assert.equal(f.counts.meta,0);
});
check('invalid provider configuration cannot reserve even with SQL policy on',{keyValid:false},async f=>{assert.equal((await f.options()).body.smsEnabled,false);assert.equal((await f.send()).body.state,'not_sent');assert.equal(f.counts.rpc.nova_client_otp_reserve,undefined);assert.equal(f.counts.provider,0);});
check('worker hard-off blocks new sends without context/RPC/provider calls',{envFlag:false},async f=>{assert.equal((await f.send()).status,503);assert.equal(Object.keys(f.counts.rpc).length,0);assert.equal(f.counts.provider,0);});
check('wrong pilot phone remains forbidden without a reservation or fallback',{},async f=>{const result=await f.send({celular:'3000000001'});assert.equal(result.status,403);assert.equal((await f.ledger()).length,0);assert.equal(f.counts.provider,0);assert.equal(f.counts.meta,0);});
for(const status of [401,429])check('provider '+status+' retains one reserved39 attempt and replay never resends',{status},async f=>{
 const first=await f.send();assert.equal(first.body.state,'failed');assert.ok(first.body.retry_after>0);await f.send();const rows=await f.ledger();assert.equal(rows.length,1);assert.equal(rows[0].state,'failed');assert.equal(Number(rows[0].reserved_cost_cop),39);assert.equal(rows[0].reported_cost_cop,null);assert.notEqual(rows[0].envio_fallido_at,null);assert.equal(rows[0].envio_aceptado_at,null);assert.equal(f.counts.provider,1);assert.equal(f.counts.meta,0);assert.equal(f.counts.rpc.nova_client_otp_reserve,1);assert.ok(f.timeouts.includes(30000));
});
check('published8s baseline reproduces cutoff before12s synchronous acknowledgement',{source:baseline,delayMs:12000},async f=>{assert.equal((await f.send()).body.state,'uncertain');assert.ok(f.timeouts.includes(8000));assert.equal((await f.ledger())[0].error_code,'PROVIDER_TIMEOUT');assert.equal(f.counts.provider,1);});
check('candidate30s provider wait accepts12s acknowledgement without extending original5min expiry',{delayMs:12000},async f=>{
 const result=await f.send();assert.equal(result.body.state,'accepted');assert.equal(result.body.retry_after,288);assert.ok(f.timeouts.includes(30000));const before=(await f.ledger())[0];await f.send();const after=(await f.ledger())[0];assert.equal(before.request_id,ids.request);assert.equal(before.expira_at.toISOString(),after.expira_at.toISOString());assert.equal(after.provider_message_id,ids.consumption);assert.equal(Number(after.reserved_cost_cop),39);assert.equal(Number(after.reported_cost_cop),39);assert.equal(f.counts.provider,1);assert.equal(result.body.delivery_confirmed,undefined);
});
check('30s timeout remains uncertain; identical UUID and new UUID cannot duplicate transport',{delayMs:31000},async f=>{
 const result=await f.send();assert.equal(result.status,202);assert.equal(result.body.state,'uncertain');assert.equal(result.body.retry_after,270);await f.send();
 // PGlite retains its wall clock while the provider delay above is virtual.
 // Align this distinct reservation probe to SQL time so OTP_ACTIVE, rather
 // than the independent future-expiry guard, is what rejects the new UUID.
 const other=await f.sandbox.sendManagedOtp({...input,request_id:ids.otherRequest},null,f.env,{...f.deps,now:Date.now});assert.equal(other.status,409);assert.equal(other.body.reason,'active_challenge');
 const rows=await f.ledger();assert.equal(rows.length,1);assert.equal(rows[0].error_code,'PROVIDER_TIMEOUT');assert.equal(rows[0].envio_aceptado_at,null);assert.equal(Number(rows[0].reserved_cost_cop),39);assert.equal(rows[0].reported_cost_cop,null);assert.equal(f.counts.provider,1);assert.equal(f.counts.meta,0);
});
check('late trusted acknowledgement finalizes same UUID/attempt after SQL pause with no second SMS',{delayMs:31000},async f=>{
 await f.send();const original=(await f.ledger())[0];await f.db.exec('update public.nova_client_otp_policy set enabled=false');
 const args={p_request_id:original.request_id,p_attempt_id:original.attempt_id,p_status:'accepted',p_provider_message_id:ids.consumption,p_error_code:null,p_reported_cost_cop:39};await f.callRpc('nova_client_otp_finish',args);await f.callRpc('nova_client_otp_finish',args);
 const status=await f.status();assert.equal(status.body.state,'accepted');assert.equal(status.body.retry_after,270);await f.send();const row=(await f.ledger())[0];assert.equal(row.request_id,original.request_id);assert.equal(row.otp_id,original.otp_id);assert.equal(row.expira_at.toISOString(),original.expira_at.toISOString());assert.equal(f.counts.provider,1);assert.equal((await f.options()).body.smsEnabled,false);
});
check('accepted provider acknowledgement with lost DB finish remains reserved until same-attempt reconciliation',{delayMs:12000,loseFinish:true},async f=>{
 const initial=await f.send();assert.equal(initial.body.state,'uncertain');const row=(await f.ledger())[0];assert.equal(row.state,'reserved');await f.send();assert.equal(f.counts.provider,1);assert.equal((await f.ledger()).length,1);
 await f.callRpc('nova_client_otp_finish',{p_request_id:row.request_id,p_attempt_id:row.attempt_id,p_status:'accepted',p_provider_message_id:ids.consumption,p_error_code:null,p_reported_cost_cop:39});assert.equal((await f.status()).body.state,'accepted');assert.equal((await f.ledger())[0].expira_at.toISOString(),row.expira_at.toISOString());
});
check('SQL pause during send allows finish/status/real HMAC verification but no new SMS',{pauseDuringProvider:true,delayMs:12000},async f=>{
 assert.equal((await f.send()).body.state,'accepted');const row=(await f.ledger())[0];assert.equal((await f.options()).body.smsEnabled,false);assert.equal((await f.status()).body.state,'accepted');
 assert.equal((await f.verify('123455')).status,400);const verified=await f.verify();assert.equal(verified.status,200);assert.equal(typeof verified.body.registro_session,'string');const session=await f.verifySession(verified.body.registro_session);assert.equal(session.otpId,row.otp_id);assert.equal(session.enlaceId,ids.link);assert.equal(session.cedula,input.cedula);assert.equal(session.celular,input.celular);
 const replay=await f.status();assert.equal(replay.body.state,'verified');
 // New request uses SQL wall clock to test the disabled-policy gate itself.
 const blocked=await f.sandbox.sendManagedOtp({...input,request_id:ids.otherRequest},null,f.env,{...f.deps,now:Date.now});assert.equal(blocked.body.state,'not_sent');assert.equal(blocked.status,429);assert.equal((await f.ledger()).length,1);assert.equal(f.counts.provider,1);assert.equal(f.counts.meta,0);
});
check('late acknowledgement after original expiry never renews TTL or makes expired code verifiable',{delayMs:31000},async f=>{
 await f.send();const original=(await f.ledger())[0];f.advance(300001);await f.callRpc('nova_client_otp_finish',{p_request_id:original.request_id,p_attempt_id:original.attempt_id,p_status:'accepted',p_provider_message_id:ids.consumption,p_error_code:null,p_reported_cost_cop:39});assert.equal((await f.status()).body.state,'expired');assert.equal((await f.status()).body.retry_after,0);assert.equal((await f.verify()).status,400);assert.equal((await f.ledger())[0].expira_at.toISOString(),original.expira_at.toISOString());assert.equal(f.counts.provider,1);
});
check('HTTP200 with unknown acceptance shape remains uncertain',{providerBody:{ok:true,messages:1,credits:1}},async f=>{assert.equal((await f.send()).body.state,'uncertain');assert.equal((await f.ledger())[0].envio_aceptado_at,null);await f.send();assert.equal(f.counts.provider,1);});
check('existing202queued parser remains unchanged while requests still explicitly use asyncfalse',{status:202,providerBody:{ok:true,jobId:'job_synthetic_12345',messages:1}},async f=>{assert.equal((await f.send()).body.state,'accepted');assert.equal((await f.ledger())[0].provider_message_id,'job_synthetic_12345');assert.equal(f.counts.provider,1);});

import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {setup,original,candidate,form,ids,diagnosticCandidate} from './route-fixture.mjs';
import {transformRoute,BEFORE,AFTER,BASELINE_SHA256,FORM_SHA256,sha} from '../../nova-sms-activation-20261030/route-transform.mjs';
const cases=[];
const check=(name,fn)=>test(name,async()=>{await fn();cases.push(name)});
check('prior route repair remains intact: activation gate control still differs by exactly one line',async()=>{
 assert.equal(sha(original),BASELINE_SHA256);assert.equal(sha(form),FORM_SHA256);assert.equal(transformRoute(original),candidate);
 assert.equal(candidate.replace(AFTER,BEFORE),original);assert.equal(candidate.split(AFTER).length,2);
 assert.throws(()=>transformRoute(candidate),/DRIFT/);assert.throws(()=>transformRoute(original+'\n'),/DRIFT/);
});
for(const lostFirst of [true,false]){
 check('baseline regression with flag true, non-pilot WA, first200 '+(lostFirst?'lost':'received'),async()=>{
  const f=await setup({source:original});try{const ui=await f.formScenario({lostFirst});assert.deepEqual(ui.responses.map(r=>r.status),[200,409]);assert.equal(ui.after,false);assert.deepEqual(f.totals(),{meta:1,reserves:2});assert.deepEqual(await f.queryCounts(),{challenges:1,accepted:1});assert.equal(ui.photosPreserved,true);}finally{await f.db.close();}
 });
 check('candidate preserves non-pilot WA code entry after first200 '+(lostFirst?'lost':'received')+' with no second send',async()=>{
  const f=await setup();try{const ui=await f.formScenario({lostFirst});assert.deepEqual(ui.responses.map(r=>r.status),[200,202]);assert.equal(ui.responses[1].body.state,'accepted');assert.equal(ui.after,true);assert.deepEqual(f.totals(),{meta:1,reserves:1});assert.deepEqual(await f.queryCounts(),{challenges:1,accepted:1});assert.equal(ui.photosPreserved,true);assert.match(ui.status,/código solicitado/);}finally{await f.db.close();}
 });
}
check('SMS flag off keeps repaired legacy WA recovery identical',async()=>{
 const f=await setup({flag:false});try{const ui=await f.formScenario({lostFirst:true});assert.deepEqual(ui.responses.map(r=>r.status),[200,202]);assert.equal(ui.after,true);assert.deepEqual(f.totals(),{meta:1,reserves:1});}finally{await f.db.close();}
});
check('explicit SMS while flag off is blocked without reserve or provider call',async()=>{
 const f=await setup({flag:false});try{const out=await f.post(f.standard({request_id:'40000000-0000-4000-8000-000000000004',channel:'sms',sms_reason:'no_whatsapp'}));assert.equal(out.status,503);assert.equal(out.body.state,'not_sent');assert.deepEqual(f.totals(),{meta:0,reserves:0});assert.equal((await f.queryCounts()).challenges,0);}finally{await f.db.close();}
});
check('explicit managed UUID replay retains same accepted challenge and sends once',async()=>{
 const f=await setup();try{const body=f.standard({request_id:'40000000-0000-4000-8000-000000000004',channel:'whatsapp'}),first=await f.post(body),second=await f.post(body);assert.equal(first.status,200);assert.equal(second.status,200);assert.equal(second.body.otp_id,first.body.otp_id);assert.equal(second.body.request_id,first.body.request_id);assert.deepEqual(f.totals(),{meta:1,reserves:1});assert.equal(f.counts.managedCaptcha,1);}finally{await f.db.close();}
});
check('explicit SMS outside pilot gets403 with no new OTP or provider call',async()=>{
 const f=await setup();try{const out=await f.post(f.standard({request_id:'40000000-0000-4000-8000-000000000004',channel:'sms',sms_reason:'no_whatsapp'}));assert.equal(out.status,403);assert.equal(out.body.state,'not_sent');assert.equal(f.totals().meta,0);assert.equal((await f.queryCounts()).challenges,0);}finally{await f.db.close();}
});
for(const flag of [true,false])check('plaintext legacy routing remains unchanged with flag '+flag,async()=>{
 const f=await setup({flag});try{assert.deepEqual((await f.post({celular:'3000000000'})).body,{legacy:true});assert.equal(f.counts.plain,1);assert.deepEqual(f.totals(),{meta:0,reserves:0});}finally{await f.db.close();}
});
check('current SQL guard keeps WA active against a managed SMS reservation',async()=>{
 const f=await setup();try{assert.equal((await f.post(f.standard())).status,200);const out=await f.post(f.standard({request_id:'40000000-0000-4000-8000-000000000004',channel:'sms',sms_reason:'no_whatsapp'}));assert.equal(out.status,409);assert.equal(out.body.reason,'active_challenge');assert.equal(f.totals().meta,1);assert.equal((await f.queryCounts()).challenges,1);}finally{await f.db.close();}
});
check('current SQL guard keeps SMS active against legacy WA without changing code expiry',async()=>{
 const f=await setup();try{await f.db.exec("update public.nova_client_otp_policy set pilot_allowed_phones=array['3000000000'];");
 const saved=(await f.db.query("select public.nova_client_otp_reserve('12345678','3000000000',$1,$2,'sms','no_whatsapp',repeat('A',43),now()+interval '4 minutes') value",[ids.a,'40000000-0000-4000-8000-000000000004'])).rows[0].value;
 const out=await f.post(f.standard());assert.equal(out.status,202);assert.equal(out.body.state,'uncertain');assert.equal((await f.queryCounts()).challenges,1);assert.deepEqual(f.totals(),{meta:0,reserves:0});
 const expiry=(await f.db.query('select expira_at from public.otp_codigos where id=$1',[saved.otpId])).rows[0].expira_at;assert.equal(expiry.toISOString(),new Date(saved.expiresAt).toISOString());
 }finally{await f.db.close();}
});
test.after(async()=>{await writeFile(new URL('./receipt.json',import.meta.url),JSON.stringify({tests:cases.length,passed:cases.length,baselineWorkerSha256:sha(original),candidateWorkerSha256:sha(diagnosticCandidate),activationControlSha256:sha(candidate),formSha256:sha(form),sqlChanges:false,productionWrites:0,realNetworkRequests:0,realMessages:0,cases},null,2)+'\n');});


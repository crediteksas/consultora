import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {database,harness,rows,reserve,ids,tokens,migration,baseline,candidate,predecessors} from './otp-fixture.mjs';
import {fixture as formFixture} from './ui-tests/form-harness.mjs';
const results=[];
const check=(name,fn)=>test(name,async()=>{await fn();results.push(name);});
check('SQL guard preserves original service-only ACL, invoker rights and reservation function/budgets',async()=>{
 const db=await database({patched:false});try{
 const query="select proname,proacl::text acl,prosecdef,proconfig,has_function_privilege('anon',oid,'EXECUTE') anon_execute,has_function_privilege('authenticated',oid,'EXECUTE') authenticated_execute,has_function_privilege('service_role',oid,'EXECUTE') service_execute from pg_proc where oid in ('public.nova_client_otp_guard_sms()'::regprocedure,'public.reservar_otp_registro_seguro(text,text,uuid,text,timestamptz)'::regprocedure) order by proname";
 const before=(await db.query(query)).rows;await db.exec(migration);assert.deepEqual((await db.query(query)).rows,before);
 const after=(await db.query("select md5(pg_get_functiondef('public.reservar_otp_registro_seguro(text,text,uuid,text,timestamptz)'::regprocedure)) hash")).rows[0].hash;
 assert.equal(after,predecessors.find(x=>x.signature.startsWith('reservar_')).definition_md5);
 assert.ok(before.every(r=>!r.anon_execute&&!r.authenticated_execute&&r.service_execute));
 }finally{await db.close();}
});
check('accepted first HTTP200 lost to browser: second fresh CAPTCHA yields202 accepted without another reserve or Meta send; composed form keeps photos',async()=>{
 const db=await database();try{
 const h=await harness(db);let clientPosts=0;const responses=[];
 const f=formFixture(async(path,body)=>{
  if(path==='/api/otp/opciones')return {data:{smsEnabled:false}};
  assert.equal(path,'/api/otp/enviar');clientPosts++;const result=await h.send(body);responses.push(result);
  if(clientPosts===1){assert.equal(result.status,200);throw Error('Synthetic successful HTTP200 lost before browser');}
  return {status:result.status,data:result.body};
 },{linkToken:tokens.a});
 await f.enable();await f.click('btnEnviarOtp');f.advance(16000);
 f.run("turnstileToken='second-fresh-fixture-captcha';evaluarEnvioOtp();");await f.click('btnEnviarOtp');
 assert.equal(clientPosts,2);assert.equal(responses[1].status,202);assert.equal(responses[1].body.state,'accepted');
 assert.equal(f.nodes.get('codeRow').classList.contains('show'),true);assert.doesNotMatch(f.nodes.get('otpStatus').textContent,/entregado|enviado por/i);
 assert.deepEqual({reserves:h.counts.reserves,meta:h.counts.meta,rows:(await rows(db)).length,captchas:h.usedCaptchas.size},{reserves:1,meta:1,rows:1,captchas:2});f.assertFiles();
 }finally{await db.close();}
});
check('concurrent same-context callers: both read no OTP, SQL reserves only one; loser rereads same active challenge',async()=>{
 const db=await database();try{
 let count=0,release;const barrier=new Promise(r=>{release=r});
 const h=await harness(db,{get:async({index,rows})=>{if(index<=2){assert.equal(rows.length,0);if(++count===2)release();await barrier;return Response.json(rows);}}});
 const results=await Promise.all([h.send(),h.send()]);assert.deepEqual(results.map(r=>r.status).sort(),[200,202]);
 assert.ok(['accepted','uncertain'].includes(results.find(r=>r.status===202).body.state));assert.equal(h.counts.meta,1);assert.equal(h.counts.reserves,2);assert.equal((await rows(db)).length,1);assert.ok(h.counts.gets>=3);
 }finally{await db.close();}
});
check('other document/link with same phone gets409 without disclosing OTP id, document, phone, link or accepted state',async()=>{
 const db=await database();try{const h=await harness(db);await h.send();const first=(await rows(db))[0];
 const result=await h.send({enlace_token:tokens.b,cedula:'87654321'});assert.equal(result.status,409);assert.equal(result.body.reason,'active_challenge');
 const text=JSON.stringify(result.body);for(const secret of [first.id,'12345678','87654321','3000000000',ids.a,ids.b])assert.ok(!text.includes(secret));assert.equal(result.body.state,undefined);assert.equal(h.counts.meta,1);assert.equal((await rows(db)).length,1);
 }finally{await db.close();}
});
for(const status of ['uncertain','failed'])check(status+' transport stays blocked until original TTL without another send',async()=>{
 const db=await database();try{const h=await harness(db,status==='failed'?{meta:'timeout'}:{patch:'before'});const first=await h.send();assert.ok([502,503].includes(first.status));
 const before=(await rows(db))[0];const second=await h.send();assert.equal(second.status,202);assert.equal(second.body.state,'uncertain');
 assert.equal((await rows(db))[0].expira_at.getTime(),before.expira_at.getTime());assert.equal(h.counts.meta,1);assert.equal(h.counts.reserves,1);assert.equal((await rows(db)).length,1);
 }finally{await db.close();}
});
for(const status of ['expired','verified','consumed'])check(status+' challenge permits a new explicit request while original quotas still apply',async()=>{
 const db=await database();try{const h=await harness(db);await h.send();
 if(status==='expired')await db.exec("update public.otp_codigos set expira_at=now()-interval '1 second'");
 else if(status==='verified')await db.exec("update public.otp_codigos set verificado=true");
 else await db.exec("update public.otp_codigos set registro_consumido_at=now()");
 assert.equal((await h.send()).status,200);assert.equal(h.counts.meta,2);assert.equal((await rows(db)).length,2);
 }finally{await db.close();}
});
check('active challenge lookup is after CAPTCHA and context; reused single-use CAPTCHA does not read DB or send again',async()=>{
 const db=await database();try{const h=await harness(db);await h.send({turnstile_token:'single-use-fixture'});const gets=h.counts.gets;
 const second=await h.send({turnstile_token:'single-use-fixture'});assert.equal(second.status,400);assert.equal(h.counts.gets,gets);assert.equal(h.counts.meta,1);
 assert.deepEqual(h.events.slice(0,3),['captcha','context','get']);
 }finally{await db.close();}
});
for(const [name,get] of [
 ['network failure',()=>{throw Error('DB unavailable')}],
 ['non-success',()=>Response.json({error:'unavailable'},{status:503})],
 ['oversized metadata',()=>new Response(' '.repeat(4097))],
 ['malformed JSON',()=>new Response('{bad')],
 ['inconsistent accepted and failed stamps',({rows})=>Response.json([{id:ids.a,expira_at:new Date(Date.now()+300000).toISOString(),intentos:0,envio_aceptado_at:new Date().toISOString(),envio_fallido_at:new Date().toISOString()}])]
])check('DB active lookup '+name+' fails closed before reservation/send',async()=>{
 const db=await database();try{const h=await harness(db,{get});assert.equal((await h.send()).status,503);assert.equal(h.counts.reserves,0);assert.equal(h.counts.meta,0);assert.equal((await rows(db)).length,0);
 }finally{await db.close();}
});
for(const phase of ['before','after'])check('reservation uncertainty '+phase+' commit sends zero; committed attempt remains recoverable',async()=>{
 const db=await database();try{const h=await harness(db,{reserve:phase});assert.equal((await h.send()).status,503);assert.equal(h.counts.meta,0);
 if(phase==='after'){const second=await h.send();assert.equal(second.status,202);assert.equal(second.body.state,'uncertain');assert.equal(h.counts.reserves,1);assert.equal((await rows(db)).length,1);}
 }finally{await db.close();}
});
check('lost accepted PATCH acknowledgement returns503, retry discovers accepted state with no second Meta request',async()=>{
 const db=await database();try{const h=await harness(db,{patch:'after'});assert.equal((await h.send()).status,503);
 const again=await h.send();assert.equal(again.status,202);assert.equal(again.body.state,'accepted');assert.equal(h.counts.reserves,1);assert.equal(h.counts.meta,1);
 }finally{await db.close();}
});
check('same phone remains protected across WhatsApp and SMS dispatch rows; SMS is never invoked by these tests',async()=>{
 const db=await database();try{const first=await reserve(db);await db.query("insert into public.nova_client_otp_dispatch values($1,'sms')",[first[0].otp_id]);
 await assert.rejects(reserve(db,{link:ids.b,document:'87654321'}),/OTP_ACTIVE/);assert.equal((await rows(db)).length,1);
 }finally{await db.close();}
});
check('original 3-per-phone and60-per-link budgets remain enforced with no extra send',async()=>{
 const db=await database();try{
 await db.query("insert into public.otp_codigos(cedula,celular,enlace_registro_id,codigo_hash,expira_at,envio_aceptado_at) select '12345678','3000000000',$1,repeat('A',43),now()-interval '1 second',now() from generate_series(1,3)",[ids.a]);
 await assert.rejects(reserve(db),/otp_limite_celular/);
 await db.exec('truncate public.otp_codigos');
 await db.query("insert into public.otp_codigos(cedula,celular,enlace_registro_id,codigo_hash,expira_at,envio_aceptado_at) select '12345678','3'||lpad(x::text,9,'0'),$1,repeat('A',43),now()-interval '1 second',now() from generate_series(1,60) x",[ids.a]);
 await assert.rejects(reserve(db,{phone:'3111111111'}),/otp_limite_enlace/);
 }finally{await db.close();}
});
test.after(async()=>{await writeFile(new URL('./otp-test-receipt.json',import.meta.url),JSON.stringify({tests:results.length,passed:results.length,baselineSha256:createHash('sha256').update(baseline).digest('hex'),candidateSha256:createHash('sha256').update(candidate).digest('hex'),sqlSha256:createHash('sha256').update(migration).digest('hex'),realNetworkRequests:0,realMessages:0,productionWrites:0,smsEnabled:false,cases:results},null,2)+'\n');});


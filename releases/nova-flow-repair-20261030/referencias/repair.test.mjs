import test from 'node:test';
import assert from 'node:assert/strict';
import { transformNova } from './transform.mjs';
import { database,sqlValue,dialogue,receiver,originalSource,patchSql,ids,contact,payload } from './fixtures.mjs';

test('transform is deterministic, narrow and refuses drift or double application',()=>{
 const result=transformNova(originalSource);assert.equal(result,transformNova(originalSource));
 assert.throws(()=>transformNova(result),/DRIFT/);
 assert.throws(()=>transformNova(originalSource.replace('  let accepted = false;\n  let questionStage','  let accepted = true;\n  let questionStage')),/DRIFT/);
 assert.equal(result.match(/async function processReferenceMessage\(/g).length,1);
});
test('SQL migration refuses changed predecessor',async()=>{
 const db=await database({patched:false});try{
 await db.exec("create or replace function public.nova_reference_send_ack(p_reference_id uuid,p_attempt_id uuid,p_accepted boolean) returns jsonb language sql as $$select '{}'::jsonb$$");
 await assert.rejects(db.exec(patchSql),/REF_REPAIR_SQL_DRIFT/);
 }finally{await db.close();}
});
for(const [label,transport,expected] of [
 ['timeout',async()=>{throw Error('response lost')},'uncertain'],
 ['5xx with Graph error',async()=>new Response('{"error":{"code":2}}',{status:503}),'uncertain'],
 ['redirect',async()=>new Response(null,{status:302}),'uncertain'],
 ['malformed JSON',async()=>new Response('{bad'), 'uncertain'],
 ['2xx without message receipt',async()=>new Response('{}'),'uncertain'],
 ['2xx invalid receipt id',async()=>new Response('{"messages":[{"id":"not a valid receipt"}]}'),'uncertain'],
 ['explicit 4xx rejection',async()=>new Response('{"error":{"code":131026}}',{status:400}),'failed'],
 ['valid accepted receipt',async()=>new Response('{"messages":[{"id":"fixture-accepted"}]}'),'accepted']
]) test('reference transport: '+label,async()=>{
 const db=await database();try{const r=await receiver(db,{transport});const out=await r.start();const row=await dialogue(db);
 assert.equal(row.send_state,expected);assert.equal(row.status,expected==='failed'?'stopped':'active');
 assert.equal(row.state.consent,undefined);assert.equal(row.state.stage,'consent');
 assert.equal(out.accepted,expected==='accepted');assert.equal(out.delivery_uncertain,expected==='uncertain');assert.equal(r.counts.transportCalls,1);
 }finally{await db.close();}
});
test('timeout preserves same dialogue, replay/retap do not resend, next explicit consent continues',async()=>{
 const db=await database();try{const r=await receiver(db,{transport:async()=>{throw Error('lost response')}});await r.start();
 const initial=await dialogue(db);
 await r.start();await r.start('fixture-retap');assert.equal(r.counts.transportCalls,1);
 const out=await r.run('Autorizo','fixture-consent');
 const row=await dialogue(db);assert.equal(out.accepted,true);assert.equal(row.status,'active');assert.equal(row.send_state,'accepted');
 assert.equal(row.state.consent,true);assert.equal(row.state.stage,'knows');assert.equal(row.revision,2);assert.equal(row.expires_at.getTime(),initial.expires_at.getTime());
 assert.equal(r.counts.transportCalls,1);assert.equal(r.counts.otpCalls,1);
 await r.run('Autorizo','fixture-consent');assert.equal(r.counts.otpCalls,1);
 }finally{await db.close();}
});
test('unknown OTP outcome keeps consent evidence and active dialogue; never resends old prompt',async()=>{
 const db=await database();try{const r=await receiver(db,{otpResult:{accepted:false}});await r.start();await r.run('Autorizo','fixture-consent');
 const row=await dialogue(db);assert.equal(row.state.consent,true);assert.equal(row.status,'active');assert.equal(row.send_state,'uncertain');
 assert.equal(r.counts.transportCalls,1);assert.equal(r.counts.otpCalls,1);
 }finally{await db.close();}
});
test('uncertain dialogue still honors explicit decline without inventing consent',async()=>{
 const db=await database();try{let calls=0;const r=await receiver(db,{transport:async()=>{if(++calls===1)throw Error('timeout');return new Response('{"messages":[{"id":"fixture-decline-ack"}]}')}});
 await r.start();await r.run('No autorizo','fixture-decline');const row=await dialogue(db);assert.equal(row.status,'declined');assert.equal(row.state.consent,false);assert.equal(row.outcome,'declined');assert.equal(r.counts.otpCalls,0);
 }finally{await db.close();}
});
test('revocation and expiry prevent uncertain dialogue recovery',async()=>{
 const db=await database();try{let active=true;const r=await receiver(db,{transport:async()=>{throw Error('timeout')},verifySource:async()=>active});
 await r.start();const first=await dialogue(db);active=false;assert.equal((await r.run('Autorizo','fixture-revoked')).diagnostic,'guard_4');
 assert.equal((await dialogue(db)).revision,first.revision);active=true;
 await db.query("update public.nova_reference_dialogues set expires_at=now()-interval '1 second'");const result=await r.run('Autorizo','fixture-expired');
 assert.equal(result.diagnostic,'guard_3');assert.equal((await dialogue(db)).state.consent,undefined);assert.equal(r.counts.otpCalls,0);
 }finally{await db.close();}
});
test('abandoned reserved turn requires new inbound and wait, keeps expiry, rejects old ack/replay conflict',async()=>{
 const db=await database();try{const r=await receiver(db);await r.start();const original=await dialogue(db);
 await db.query("update public.nova_reference_dialogues set send_state='reserved'");
 const blocked=await r.run('Autorizo','fixture-while-inflight');assert.equal(blocked.retryable,true);assert.equal(r.counts.otpCalls,0);
 await db.query("update public.nova_reference_dialogues set updated_at=now()-interval '2 minutes'");
 await r.start();assert.equal((await dialogue(db)).send_state,'reserved');assert.equal(r.counts.transportCalls,1);
 await r.run('Autorizo','fixture-recovery');const current=await dialogue(db);
 assert.equal(current.state.consent,true);assert.equal(current.revision,2);assert.equal(current.expires_at.getTime(),original.expires_at.getTime());
 assert.equal((await sqlValue(db,'nova_reference_send_ack',[ids.ref,original.attempt_id,false])).saved,false);
 const args=[ids.ref,contact,payload,current.expires_at,2,'fixture-start','f'.repeat(64),{stage:'consent'},null];
 await assert.rejects(sqlValue(db,'nova_reference_transition',args),/REFERENCE_REPLAY_CONFLICT/);
 assert.equal(r.counts.transportCalls,1);assert.equal(r.counts.otpCalls,1);
 }finally{await db.close();}
});

async function dispatchFixture(db){await db.query("insert into public.nova_retail_reference_dispatch(reference_id,source_id,contact_hash,state,provider_message_id,created_at,next_attempt_at) values($1,$2,$3,'accepted','fixture-message',now()-interval '1 minute',now()-interval '1 second')",[ids.ref,ids.source,contact]);}
const current=async db=>(await db.query("select state,error_code,delivered_at is not null as delivered,(state='failed' and attempts<5 and next_attempt_at<=now() and delivered_at is null) as retry_eligible from public.nova_retail_reference_dispatch")).rows[0];
const status=(db,state,seconds,error=null,message='fixture-message',hash=contact)=>sqlValue(db,'nova_retail_reference_status',[message,hash,state,new Date(Date.now()-seconds*1000).toISOString(),error]);
test('older sent callback cannot erase newer failure or retry eligibility',async()=>{
 const db=await database();try{await dispatchFixture(db);await status(db,'failed',10,131026);await status(db,'sent',20);
 assert.deepEqual(await current(db),{state:'failed',error_code:131026,delivered:false,retry_eligible:true});
 assert.equal((await db.query('select count(*)::int n from public.nova_retail_reference_dispatch_events')).rows[0].n,2);
 }finally{await db.close();}
});
test('provider time permits newer sent; ties preserve failure',async()=>{
 const db=await database();try{await dispatchFixture(db);const at=new Date(Date.now()-20000).toISOString();
 await sqlValue(db,'nova_retail_reference_status',['fixture-message',contact,'failed',at,131026]);
 await sqlValue(db,'nova_retail_reference_status',['fixture-message',contact,'sent',at,null]);assert.equal((await current(db)).state,'failed');
 await status(db,'sent',10);assert.equal((await current(db)).state,'sent');
 }finally{await db.close();}
});
test('delivery/read proof never regresses to sent/failed and error stays cleared',async()=>{
 const db=await database();try{await dispatchFixture(db);await status(db,'failed',10,131026);await status(db,'delivered',20);
 assert.equal((await current(db)).state,'delivered');await status(db,'failed',5,131026);await status(db,'sent',4);
 assert.equal((await current(db)).state,'delivered');await status(db,'read',18);await status(db,'delivered',2);
 assert.deepEqual(await current(db),{state:'read',error_code:null,delivered:true,retry_eligible:false});
 }finally{await db.close();}
});
test('callback replay is idempotent; old attempt, wrong recipient and cancelled rows cannot change current attempt',async()=>{
 const db=await database();try{await dispatchFixture(db);const at=new Date(Date.now()-10000).toISOString();
 await sqlValue(db,'nova_retail_reference_status',['fixture-message',contact,'sent',at,null]);await sqlValue(db,'nova_retail_reference_status',['fixture-message',contact,'sent',at,null]);
 assert.equal((await db.query('select count(*)::int n from public.nova_retail_reference_dispatch_events')).rows[0].n,1);
 await db.query("update public.nova_retail_reference_dispatch set provider_message_id='fixture-new-message',state='accepted'");
 assert.equal(await status(db,'failed',1,131026),false);assert.equal(await status(db,'failed',1,131026,'fixture-new-message','0'.repeat(64)),false);
 assert.equal((await current(db)).state,'accepted');
 await db.query("update public.nova_retail_reference_dispatch set state='cancelled'");
 assert.equal(await status(db,'read',1,null,'fixture-new-message'),false);assert.equal((await current(db)).state,'cancelled');
 }finally{await db.close();}
});
test('null, unknown, old and future provider statuses are rejected',async()=>{
 const db=await database();try{await dispatchFixture(db);
 assert.equal(await sqlValue(db,'nova_retail_reference_status',['fixture-message',contact,null,new Date().toISOString(),null]),false);
 assert.equal(await sqlValue(db,'nova_retail_reference_status',['fixture-message',contact,'sent',null,null]),false);
 assert.equal(await status(db,'unknown',1),false);assert.equal(await status(db,'sent',-120),false);assert.equal(await status(db,'sent',130),false);
 assert.equal((await current(db)).state,'accepted');
 }finally{await db.close();}
});
test('SQL replacement preserves service-only privileges, invoker rights and empty search_path',async()=>{
 const db=await database({patched:false});try{
 const query="select proname,proacl::text acl,prosecdef,proconfig,has_function_privilege('anon',oid,'EXECUTE') anon_execute,has_function_privilege('authenticated',oid,'EXECUTE') authenticated_execute,has_function_privilege('service_role',oid,'EXECUTE') service_execute from pg_proc where pronamespace='public'::regnamespace and proname in ('nova_reference_transition','nova_reference_send_ack','nova_retail_reference_status') order by proname";
 const before=(await db.query(query)).rows;await db.exec(patchSql);assert.deepEqual((await db.query(query)).rows,before);
 assert.ok(before.every(r=>!r.prosecdef&&!r.anon_execute&&!r.authenticated_execute&&r.service_execute&&r.proconfig.includes('search_path=""')));
 }finally{await db.close();}
});
test('uncertain recovery cannot bypass revoked reference, different contact, payload, expiry or explicit consent',async()=>{
 const db=await database();try{const r=await receiver(db,{transport:async()=>{throw Error('timeout')}});await r.start();const row=await dialogue(db);
 const args=[ids.ref,contact,payload,row.expires_at,1,'fixture-invalid-transition','c'.repeat(64),{stage:'knows'},null];
 await assert.rejects(sqlValue(db,'nova_reference_transition',args),/REFERENCE_CONSENT_REQUIRED/);
 await assert.rejects(sqlValue(db,'nova_reference_transition',args.map((v,i)=>i===1?'0'.repeat(64):v)),/REFERENCE_SCOPE_REQUIRED/);
 await assert.rejects(sqlValue(db,'nova_reference_transition',args.map((v,i)=>i===2?'d'.repeat(64):v)),/REFERENCE_SCOPE_REQUIRED/);
 await assert.rejects(sqlValue(db,'nova_reference_transition',args.map((v,i)=>i===3?new Date(Date.now()-1000):v)),/REFERENCE_SCOPE_REQUIRED/);
 await db.query('update public.nova_reference_verifications set superseded_at=now()');
 await assert.rejects(sqlValue(db,'nova_reference_transition',args),/REFERENCE_SCOPE_REQUIRED/);
 const after=await dialogue(db);assert.equal(after.revision,1);assert.equal(after.state.consent,undefined);assert.equal(r.counts.transportCalls,1);assert.equal(r.counts.otpCalls,0);
 }finally{await db.close();}
});


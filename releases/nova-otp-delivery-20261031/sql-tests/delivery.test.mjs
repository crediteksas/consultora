import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {fixture,ids,mid,migrationSha} from './fixture.mjs';
const results=[];
const check=(name,fn)=>test(name,async()=>{const f=await fixture();try{await fn(f);results.push({name,passed:true});}catch(error){results.push({name,passed:false});throw error;}finally{await f.close();}});
check('register atomically binds exact context and preserves OTP/TTL/attempts',async f=>{
 await f.seed({accepted:'-1 minute'});const old=(await f.db.query('select * from public.otp_codigos')).rows[0];
 const r=await f.register();assert.equal(r.found,true);assert.equal(r.registered,true);assert.equal(r.providerMessageId,mid);assert.equal(r.state,'accepted');assert.equal(r.otpId,ids.otp);assert.equal(r.expired,false);assert.ok(r.retryAfter>0&&r.retryAfter<=120);
 const after=(await f.db.query('select * from public.otp_codigos')).rows[0];assert.deepEqual(after,old);assert.equal(Date.parse(r.acceptedAt),old.envio_aceptado_at.getTime());
});
check('missing accepted timestamp is set once and exact replay does not duplicate',async f=>{
 await f.seed();const first=await f.register(),again=await f.register();assert.equal(first.registered,true);assert.equal(first.acceptedAt,again.acceptedAt);assert.equal(first.expiresAt,again.expiresAt);assert.equal((await f.db.query('select count(*)::int n from public.nova_otp_delivery_receipts')).rows[0].n,1);
});
check('anonymous and authenticated cannot execute RPCs or read receipt table',async f=>{
 for(const role of ['anon','authenticated']){
  await f.db.exec('set role '+role);
  for(const sql of ['select * from public.nova_otp_delivery_receipts',`select public.nova_otp_delivery_read('12345678','3000000000','${ids.link}')`,`select public.nova_otp_delivery_register('${ids.otp}','12345678','3000000000','${ids.link}','${mid}')`,`select public.nova_otp_delivery_apply('${ids.otp}','${mid}','failed',now(),'131026')`])await assert.rejects(f.db.query(sql),/permission denied/);
  await f.db.exec('reset role');
 }
 const props=(await f.db.query("select relrowsecurity from pg_class where oid='public.nova_otp_delivery_receipts'::regclass")).rows[0];assert.equal(props.relrowsecurity,true);
 const security=(await f.db.query("select proname,prosecdef from pg_proc where proname like 'nova_otp_delivery_%'")).rows;assert.ok(security.every(x=>x.prosecdef===false));
});
check('wrong cédula/celular/link cannot register or read another OTP',async f=>{
 await f.seed();for(const mismatch of [{document:'87654321'},{phone:'3000000001'},{link:ids.otherLink}]){await assert.rejects(f.register(mismatch),/CONTEXT_MISMATCH/);assert.deepEqual(await f.read(mismatch),{found:false});}
 assert.equal((await f.db.query('select count(*)::int n from public.nova_otp_delivery_receipts')).rows[0].n,0);
});
check('inactive or revoked link and inactive origin are rejected',async f=>{
 await f.seed();for(const [sql,undo] of [[`update public.enlaces_registro set activo=false where id='${ids.link}'`,`update public.enlaces_registro set activo=true where id='${ids.link}'`],[`update public.enlaces_registro set revoked_at=now() where id='${ids.link}'`,`update public.enlaces_registro set revoked_at=null where id='${ids.link}'`],["update public.origenes set activo=false where codigo='CK-01'","update public.origenes set activo=true where codigo='CK-01'"]]){await f.db.exec(sql);await assert.rejects(f.register(),/OTP_LINK_NOT_ACTIVE/);await assert.rejects(f.read(),/OTP_LINK_NOT_ACTIVE/);await f.db.exec(undo);}
});
check('plaintext unbound and expired/verified/consumed/failed OTPs cannot create a binding',async f=>{
 for(const condition of [{hash:null},{expires:'-1 minute'},{verified:true},{consumed:'-1 minute'},{failed:'-1 minute'}]){await f.db.exec('delete from public.otp_codigos');await f.seed(condition);await assert.rejects(f.register(),/CONTEXT_MISMATCH|OTP_NOT_LIVE/);}
});
check('provider ID and accepted timestamp are immutable even through direct backend update',async f=>{
 await f.seed();await f.register();await assert.rejects(f.register({messageId:'wamid.different'}),/BINDING_CONFLICT/);
 for(const sql of ["update public.nova_otp_delivery_receipts set provider_message_id='wamid.different'","update public.nova_otp_delivery_receipts set accepted_at=accepted_at-interval '1 second'",`update public.nova_otp_delivery_receipts set otp_id='${ids.otherOtp}'`])await assert.rejects(f.query(sql),/BINDING_IMMUTABLE/);
 assert.equal((await f.read()).providerMessageId,mid);
});
check('one wamid cannot bind a second OTP',async f=>{
 await f.seed();await f.register();await f.seed({id:ids.otherOtp,document:'87654321',phone:'3000000001',link:ids.otherLink});await assert.rejects(f.register({id:ids.otherOtp,document:'87654321',phone:'3000000001',link:ids.otherLink}),/unique constraint/);
});
check('signed failure is separate from API acceptance and code/TTL/quotas stay intact',async f=>{
 await f.seed({accepted:'-1 minute'});await f.register();const before=(await f.db.query('select * from public.otp_codigos')).rows[0];const r=await f.apply();assert.equal(r.state,'failed');assert.equal(r.errorCode,'131026');assert.equal(r.applied,true);
 assert.deepEqual((await f.db.query('select * from public.otp_codigos')).rows[0],before);const read=await f.read();assert.equal(read.state,'failed');assert.equal(read.expired,false);assert.ok(read.retryAfter>0);
 await assert.rejects(f.query(`select * from public.reservar_otp_registro_seguro('12345678','3000000000','${ids.link}',repeat('B',43),now()+interval '4 minutes')`),/OTP_ACTIVE/);
});
check('failed delivery blocks stale verifier update without changing other OTP fields',async f=>{
 await f.seed();await f.register();await f.apply();await assert.rejects(f.query(`update public.otp_codigos set verificado=true where id='${ids.otp}'`),/OTP_DELIVERY_FAILED/);
 const r=(await f.db.query('select verificado,intentos from public.otp_codigos')).rows[0];assert.equal(r.verificado,false);await f.query(`update public.otp_codigos set intentos=intentos+1 where id='${ids.otp}'`);assert.equal((await f.db.query('select intentos from public.otp_codigos')).rows[0].intentos,r.intentos+1);
});
check('normal bound and plaintext verification is unaffected by the new trigger',async f=>{
 await f.seed();await f.register();await f.query(`update public.otp_codigos set verificado=true where id='${ids.otp}'`);await f.seed({id:ids.otherOtp,phone:'3000000001',hash:null,link:null});await f.query(`update public.otp_codigos set verificado=true where id='${ids.otherOtp}'`);assert.equal((await f.db.query('select count(*)::int n from public.otp_codigos where verificado')).rows[0].n,2);
});
check('wrong wamid/OTP and stale or future event timestamps are rejected',async f=>{
 await f.seed();await f.register();for(const event of [{messageId:'wamid.other'},{id:ids.otherOtp},{offset:'-3 minutes'},{offset:'2 minutes'},{state:'forged'},{code:'not-numeric'},{messageId:'not-a-wamid'}])await assert.rejects(f.apply(event),/BINDING_CONFLICT|CONTEXT_MISMATCH|TIME_INVALID|EVENT_INVALID/);
 assert.equal((await f.read()).state,'accepted');
});
check('same signed event is idempotent and failure cannot be overwritten by late progress',async f=>{
 await f.seed();await f.register();const first=await f.apply();assert.equal((await f.apply({eventAt:first.eventAt})).applied,false);
 for(const state of ['accepted','sent','delivered','read']){const r=await f.apply({state,offset:'-1 second',code:null});assert.equal(r.applied,false);assert.equal(r.state,'failed');}
});
check('out of order progress cannot regress state',async f=>{
 await f.seed();await f.register();assert.equal((await f.apply({state:'delivered',offset:'-30 seconds',code:null})).state,'delivered');assert.equal((await f.apply({state:'sent',offset:'-20 seconds',code:null})).applied,false);assert.equal((await f.apply({state:'read',offset:'-10 seconds',code:null})).state,'read');
});
check('read followed by older signed failure is terminal and preserves accepted history/TTL',async f=>{
 await f.seed({accepted:'-1 minute'});const registered=await f.register();const before=(await f.db.query('select * from public.otp_codigos')).rows[0];
 await f.apply({state:'read',offset:'-10 seconds',code:null});const failed=await f.apply({state:'failed',offset:'-40 seconds',code:'131026'});assert.equal(failed.applied,true);assert.equal(failed.state,'failed');assert.equal(failed.acceptedAt,registered.acceptedAt);assert.equal(failed.errorCode,'131026');
 assert.equal((await f.apply({state:'read',offset:'-1 second',code:null})).state,'failed');assert.equal((await f.apply({state:'accepted',offset:'-1 second',code:null})).applied,false);
 assert.deepEqual((await f.db.query('select * from public.otp_codigos')).rows[0],before);assert.equal((await f.read()).expiresAt,registered.expiresAt);await assert.rejects(f.query(`update public.otp_codigos set verificado=true where id='${ids.otp}'`),/OTP_DELIVERY_FAILED/);
});
check('whole second Meta timestamps before API acceptance are accepted only after OTP creation',async f=>{
 await f.seed();await f.register();assert.equal((await f.apply({state:'sent',offset:'-90 seconds',code:null})).state,'sent');
});
check('expired old attempt event never changes a newer OTP or its guard',async f=>{
 await f.seed();await f.register();await f.db.exec(`update public.otp_codigos set expira_at=now()-interval '1 second' where id='${ids.otp}'`);await f.seed({id:ids.otherOtp,created:'-1 second',expires:'4 minutes'});const before=(await f.db.query('select * from public.otp_codigos where id=$1',[ids.otherOtp])).rows[0];await f.apply();assert.deepEqual((await f.db.query('select * from public.otp_codigos where id=$1',[ids.otherOtp])).rows[0],before);const latest=await f.read();assert.equal(latest.otpId,ids.otherOtp);assert.equal(latest.registered,false);assert.equal(latest.providerMessageId,null);assert.equal(latest.state,'uncertain');
});
check('register replay stays bound to its original OTP even after a newer attempt exists',async f=>{
 await f.seed();const first=await f.register();await f.db.exec(`update public.otp_codigos set expira_at=now()-interval '1 second' where id='${ids.otp}'`);await f.seed({id:ids.otherOtp,created:'-1 second',expires:'4 minutes'});const replay=await f.register();assert.equal(replay.otpId,ids.otp);assert.equal(replay.providerMessageId,first.providerMessageId);assert.equal(replay.acceptedAt,first.acceptedAt);assert.equal(replay.expired,true);assert.equal((await f.read()).otpId,ids.otherOtp);
});
check('opaque attempt ID pins reads to the original OTP despite a newer same-context attempt',async f=>{
 await f.seed();const first=await f.register();await f.db.exec(`update public.otp_codigos set expira_at=now()-interval '1 second' where id='${ids.otp}'`);await f.seed({id:ids.otherOtp,created:'-1 second',expires:'4 minutes'});
 assert.equal((await f.read()).otpId,ids.otherOtp);const pinned=await f.read({id:ids.otp});assert.equal(pinned.otpId,ids.otp);assert.equal(pinned.registered,true);assert.equal(pinned.providerMessageId,first.providerMessageId);assert.equal(pinned.expired,true);assert.equal(pinned.acceptedAt,first.acceptedAt);
 for(const mismatch of [{document:'87654321'},{phone:'3000000001'},{link:ids.otherLink}])assert.deepEqual(await f.read({...mismatch,id:ids.otp}),{found:false});
 assert.deepEqual(await f.read({id:'50000000-0000-4000-8000-000000000005'}),{found:false});
});
check('legacy read is bound, finite and excludes OTPs older than24h',async f=>{
 await f.seed({accepted:'-1 minute'});let r=await f.read();assert.equal(r.registered,false);assert.equal(r.state,'accepted');assert.equal(r.providerMessageId,null);await f.db.exec("update public.otp_codigos set expira_at=now()-interval '1 minute'");r=await f.read();assert.equal(r.expired,true);assert.equal(r.retryAfter,0);await f.db.exec("update public.otp_codigos set created_at=now()-interval '25 hours'");assert.deepEqual(await f.read(),{found:false});
});
check('existing functions ACLs guard and quota implementation are byte-for-byte preserved',async f=>{
 const names=f.before.map(x=>x.proname);const after=(await f.db.query('select proname,pg_get_functiondef(oid) definition,proacl::text acl from pg_proc where pronamespace=\'public\'::regnamespace and proname=any($1) order by oid',[names])).rows;assert.deepEqual(after,f.before);
 await f.seed();await f.register();await f.apply();const accepted=(await f.db.query('select envio_aceptado_at,envio_fallido_at from public.otp_codigos')).rows[0];assert.notEqual(accepted.envio_aceptado_at,null);assert.equal(accepted.envio_fallido_at,null);
});
test.after(async()=>{const result={checkedAtUTC:new Date().toISOString(),engine:'PGlite embedded PostgreSQL, role/ACL SQL; native concurrency is a separate check',tests:results.length,passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length,migrationSha256:migrationSha,realMessages:0,productionWrites:0,results};await writeFile(new URL('./receipt.json',import.meta.url),JSON.stringify(result,null,2)+'\n');});

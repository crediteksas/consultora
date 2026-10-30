import test, {before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {NativePostgres} from './native-postgres.mjs';
const {PGlite}=process.env.NOVA_SQL_NATIVE_CONTAINER?{}:await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
let db,originalDefinitions,initialPolicy;
const LINK='10000000-0000-4000-8000-000000000001';
const OTHER_LINK='10000000-0000-4000-8000-000000000002';
const PHONE='3000000001',DOC='100001',HASH='A'.repeat(43);
const preserved=['reservar_otp_registro_seguro','kora_nova_retail_resume','kora_nova_retail_seed_photos'];
const q=(text,params=[])=>db.query(text,params);
const value=async(text,params=[])=>Object.values((await q(text,params)).rows[0])[0];
async function asService(fn){await db.exec('set role service_role');try{return await fn();}finally{await db.exec('reset role');}}
const reserve=(opts={})=>asService(()=>value('select public.nova_client_otp_reserve($1,$2,$3,$4,$5,$6,$7,$8::timestamptz)',[
 opts.doc??DOC,opts.phone??PHONE,opts.link??LINK,opts.request??randomUUID(),opts.channel??'sms',
 Object.hasOwn(opts,'reason')?opts.reason:(opts.channel==='whatsapp'?null:'no_whatsapp'),opts.hash??HASH,opts.expiry??new Date(Date.now()+240000).toISOString()]));
const finish=(r,status,extra={})=>asService(()=>value('select public.nova_client_otp_finish($1,$2,$3,$4,$5,$6)',[
 r.requestId,extra.attempt??r.attemptId,status,extra.providerId??(status==='accepted'?'fixture-provider-1':null),extra.error??null,extra.cost??null]));
const status=(r,extra={})=>asService(()=>value('select public.nova_client_otp_status($1,$2,$3,$4)',[r.requestId,extra.doc??DOC,extra.phone??PHONE,extra.link??LINK]));
const options=(phone)=>asService(()=>phone===undefined?value('select public.nova_client_otp_options($1)',[LINK]):value('select public.nova_client_otp_options($1,$2)',[LINK,phone]));
const enable=()=>db.exec('update public.nova_client_otp_policy set enabled=true');
const expire=r=>q("update public.otp_codigos set expira_at=now()-interval '1 second' where id=$1",[r.otpId]);
const original=phone=>asService(()=>value("select otp_id from public.reservar_otp_registro_seguro($1,$2,$3,$4,now()+interval '4 minutes')",[DOC,phone,LINK,HASH]));

before(async()=>{
 db=process.env.NOVA_SQL_NATIVE_CONTAINER?new NativePostgres(process.env.NOVA_SQL_NATIVE_CONTAINER):new PGlite();
 await db.exec(await readFile(new URL('./fixture.sql',import.meta.url),'utf8'));
 const definitions=JSON.parse(await readFile(new URL('./current-otp-definitions.json',import.meta.url),'utf8'));
 for(const name of [...preserved,'proteger_otp_registro_seguro']){
  const def=definitions.find(d=>d.proname===name);assert.ok(def,name);await db.exec(def.definition);
 }
 await db.exec(`create trigger fixture_hash_guard before insert or update of enlace_registro_id,codigo_hash,codigo on public.otp_codigos
 for each row execute function public.proteger_otp_registro_seguro();
 revoke all on function public.reservar_otp_registro_seguro(text,text,uuid,text,timestamptz) from public,anon,authenticated;
 grant execute on function public.reservar_otp_registro_seguro(text,text,uuid,text,timestamptz) to service_role;
 revoke all on function public.kora_nova_retail_resume(uuid,uuid,text,text),public.kora_nova_retail_seed_photos(uuid,uuid,text) from public,anon,authenticated;
 grant execute on function public.kora_nova_retail_resume(uuid,uuid,text,text),public.kora_nova_retail_seed_photos(uuid,uuid,text) to service_role;`);
 originalDefinitions=await q("select proname,pg_get_functiondef(oid) as definition from pg_proc where proname=any($1::text[]) order by proname",[preserved]);
 await db.exec(await readFile(new URL('../../../supabase/migrations/20261030165534_nova_client_sms_otp_budget.sql',import.meta.url),'utf8'));
 initialPolicy=await value('select to_jsonb(p) from public.nova_client_otp_policy p');
});
after(async()=>{await db?.close();});
beforeEach(async()=>{
 await db.exec(`truncate public.nova_client_otp_dispatch,public.nova_retail_photo_reviews,public.documentos_solicitud,
 public.nova_retail_cases,public.kora_nova_sources,public.clientes,public.otp_codigos,public.enlaces_registro,public.origenes cascade;
 update public.nova_client_otp_policy set mode='active',enabled=false,daily_sms_limit=10,monthly_sms_limit=100,unit_price_cop=39,monthly_budget_cop=3900,
 allowed_origins=array['CK-01','CK-02','CK-03','CK-04','CK-05','CK-06','CK-07','CK-08','CK-09'];
 insert into public.origenes(codigo) values('CK-01'),('CK-02'),('CK-99');
 insert into public.enlaces_registro(id,origen_codigo,token_hash) values('${LINK}','CK-01','fixture-link-1'),('${OTHER_LINK}','CK-02','fixture-link-2');`);
});

test('migration preserves the exact original reserve/resume/seed function definitions',async()=>{
 assert.deepEqual((await q("select proname,pg_get_functiondef(oid) as definition from pg_proc where proname=any($1::text[]) order by proname",[preserved])).rows,originalDefinitions.rows);
});
test('active-mode regression preserves general ceilings and WA while SMS is paused',async()=>{
 const p=await value('select to_jsonb(p) from public.nova_client_otp_policy p');
 assert.equal(p.enabled,false);assert.equal(p.daily_sms_limit,10);assert.equal(p.monthly_sms_limit,100);assert.equal(Number(p.unit_price_cop),39);assert.equal(Number(p.monthly_budget_cop),3900);
 await assert.rejects(db.exec('update public.nova_client_otp_policy set unit_price_cop=1'),/check constraint/);
 await assert.rejects(reserve(),/SMS_DISABLED/);const wa=await reserve({channel:'whatsapp'});assert.equal(wa.canSend,true);assert.equal(Number(wa.reservedCostCop),0);
});
test('all new RPCs are SECURITY INVOKER with empty search_path and service-only EXECUTE',async()=>{
 const rows=(await q("select proname,prosecdef,proconfig,has_function_privilege('anon',oid,'execute') a,has_function_privilege('authenticated',oid,'execute') u,has_function_privilege('service_role',oid,'execute') s from pg_proc where proname like 'nova_client_otp_%' order by proname")).rows;
 assert.equal(rows.length,6);for(const r of rows){assert.equal(r.prosecdef,false);assert.deepEqual(r.proconfig,['search_path=""']);assert.equal(r.a,false);assert.equal(r.u,false);assert.equal(r.s,true);}
 const rls=(await q("select relrowsecurity from pg_class where relname in ('nova_client_otp_dispatch','nova_client_otp_policy')")).rows;
 assert.equal(rls.length,2);assert.ok(rls.every(x=>x.relrowsecurity));
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{await assert.rejects(q('select * from public.nova_client_otp_dispatch'),/permission denied/);}finally{await db.exec('reset role');}}
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{await assert.rejects(q("insert into public.otp_codigos(celular,expira_at) values('3000000099',now()+interval '1 minute')"),/row-level security|permission denied/);}finally{await db.exec('reset role');}}
 await asService(()=>assert.rejects(q('update public.nova_client_otp_policy set enabled=true'),/permission denied/));
});
test('only explicit no_whatsapp SMS requests with valid active pilot links are allowed',async()=>{
 await enable();await assert.rejects(reserve({reason:null}),/OTP_REASON_REQUIRED/);await assert.rejects(reserve({reason:'timeout'}),/OTP_REASON_REQUIRED/);
 await assert.rejects(reserve({channel:'email'}),/OTP_INPUT_INVALID/);
 await q('update public.enlaces_registro set activo=false where id=$1',[LINK]);await assert.rejects(reserve(),/OTP_LINK_NOT_ACTIVE/);
 await q('update public.enlaces_registro set activo=true,revoked_at=now() where id=$1',[LINK]);await assert.rejects(reserve(),/OTP_LINK_NOT_ACTIVE/);
 await q('update public.enlaces_registro set revoked_at=null where id=$1',[LINK]);await db.exec("update public.origenes set activo=false where codigo='CK-01'");await assert.rejects(reserve(),/OTP_LINK_NOT_ACTIVE/);
});
test('repeated request is canSend=false even if a retry generated another hash and expiry',async()=>{
 await enable();const a=await reserve();const b=await reserve({request:a.requestId,hash:'B'.repeat(43)});
 assert.equal(b.canSend,false);assert.equal(b.otpId,a.otpId);assert.equal(b.attemptId,a.attemptId);assert.equal(b.expiresAt,a.expiresAt);
 assert.equal(Number(await value('select count(*) from public.otp_codigos')),1);assert.equal(Number(await value('select count(*) from public.nova_client_otp_dispatch')),1);
});
test('a request UUID cannot change recipient, identity, origin, channel or reason',async()=>{
 await enable();const a=await reserve();
 for(const extra of [{phone:'3000000002'},{doc:'100002'},{link:OTHER_LINK},{channel:'whatsapp',reason:null}])await assert.rejects(reserve({request:a.requestId,...extra}),/OTP_REQUEST_CONFLICT/);
});
test('wrapper blocks any live unverified legacy OTP including boolean-FAILED, across channels and links',async()=>{
 await enable();const id=await original(PHONE);await q('update public.otp_codigos set envio_fallido_at=now() where id=$1',[id]);
 await assert.rejects(reserve(),/OTP_ACTIVE/);await assert.rejects(reserve({channel:'whatsapp',link:OTHER_LINK}),/OTP_ACTIVE/);
 await q("update public.otp_codigos set expira_at=now()-interval '1 second' where id=$1",[id]);assert.equal((await reserve()).canSend,true);
});
test('SMS ledger guard blocks a late original WA caller even after SMS is paused or failed',async()=>{
 await enable();const a=await reserve();await finish(a,'failed');await db.exec('update public.nova_client_otp_policy set enabled=false');
 await assert.rejects(original(PHONE),/OTP_ACTIVE/);await expire(a);assert.ok(await original(PHONE));
});
test('original WA-only behavior is unchanged when no live SMS ledger exists',async()=>{
 assert.ok(await original(PHONE));assert.ok(await original(PHONE));
 assert.equal(Number(await value('select count(*) from public.otp_codigos')),2);
});
test('accepted requires provider ID, updates compatible fields, and cannot regress on retry',async()=>{
 await enable();const a=await reserve();await assert.rejects(finish(a,'accepted',{providerId:''}),/OTP_RECEIPT_INVALID/);
 const accepted=await finish(a,'accepted');await finish(a,'accepted');assert.equal(accepted.state,'accepted');
 const otp=await value('select to_jsonb(o) from public.otp_codigos o where id=$1',[a.otpId]);assert.ok(otp.envio_aceptado_at);assert.equal(otp.envio_fallido_at,null);
 await assert.rejects(finish(a,'failed'),/OTP_STATE_TERMINAL/);await assert.rejects(finish(a,'accepted',{providerId:'different'}),/OTP_RECEIPT_CONFLICT/);
});
test('uncertain can retain a provider ID but sets neither accepted nor failed; no duplicate send lease',async()=>{
 await enable();const a=await reserve();await finish(a,'uncertain',{providerId:'fixture-pending-id'});
 const otp=await value('select to_jsonb(o) from public.otp_codigos o where id=$1',[a.otpId]);assert.equal(otp.envio_aceptado_at,null);assert.equal(otp.envio_fallido_at,null);
 assert.equal((await reserve({request:a.requestId})).canSend,false);await assert.rejects(reserve({channel:'whatsapp'}),/OTP_ACTIVE/);
 await finish(a,'accepted',{providerId:'fixture-pending-id'});assert.equal((await status(a)).state,'accepted');
});
test('wrong attempt or malformed receipt cannot mutate or acknowledge an OTP',async()=>{
 await enable();const a=await reserve();await assert.rejects(finish(a,'accepted',{attempt:randomUUID()}),/OTP_ATTEMPT_CONFLICT/);
 await assert.rejects(finish(a,'delivered'),/OTP_RECEIPT_INVALID/);await assert.rejects(finish(a,'accepted',{cost:-1}),/OTP_RECEIPT_INVALID/);
 assert.equal((await status(a)).state,'reserved');
});
test('daily count, monthly count and monthly money all reserve before a second spend',async()=>{
 for(const cap of ['daily_sms_limit=1','monthly_sms_limit=1','monthly_budget_cop=39']){
  await db.exec('truncate public.nova_client_otp_dispatch,public.otp_codigos cascade');
  await db.exec('update public.nova_client_otp_policy set enabled=true,daily_sms_limit=10,monthly_sms_limit=100,monthly_budget_cop=3900');
  await db.exec('update public.nova_client_otp_policy set '+cap);
  await reserve();await assert.rejects(reserve({phone:'3000000002'}),/SMS_BUDGET_LIMIT/);
  assert.equal(Number(await value('select count(*) from public.nova_client_otp_dispatch')),1);
 }
});
test('FAILED and UNCERTAIN retain the full reserved cost; reported lower cost never refunds budget',async()=>{
 await enable();await db.exec('update public.nova_client_otp_policy set monthly_budget_cop=39');const a=await reserve();
 await finish(a,'failed',{cost:0});await expire(a);await assert.rejects(reserve({phone:'3000000002'}),/SMS_BUDGET_LIMIT/);
 const opts=await options();assert.equal(Number(opts.monthlyCostReservedCop),39);assert.equal(opts.budgetAvailable,false);
});
test('three SMS per phone/hour counts failed dispatches even though old quota excluded them',async()=>{
 await enable();for(let i=0;i<3;i++){const a=await reserve();await finish(a,'failed');await expire(a);}
 await assert.rejects(reserve(),/SMS_PHONE_LIMIT/);
});
test('a reported price above its reservation retains acceptance and immediately gates all further SMS',async()=>{
 await enable();const a=await reserve();await finish(a,'accepted',{cost:40});
 const opts=await options();assert.equal(opts.smsEnabled,false);assert.equal(opts.costAnomaly,true);assert.equal(Number(opts.monthlyCostReservedCop),40);
 await assert.rejects(reserve({phone:'3000000002'}),/SMS_COST_ANOMALY/);
 assert.equal((await status(a)).state,'accepted');
 const wa=await reserve({phone:'3000000002',channel:'whatsapp'});assert.equal(wa.canSend,true);
});
test('status derives expiry, revalidates binding/link, and returns no provider ID or cost',async()=>{
 await enable();const a=await reserve();assert.equal('otpId' in await status(a),false);
 await finish(a,'uncertain');assert.equal('otpId' in await status(a),false);
 await finish(a,'accepted');const current=await status(a);
 assert.equal(current.found,true);assert.equal(current.state,'accepted');assert.ok(current.retryAfter>0);
 assert.equal(current.otpId,a.otpId);
 assert.equal('providerMessageId' in current,false);assert.equal('reservedCostCop' in current,false);
 assert.deepEqual(await status(a,{phone:'3000000002'}),{found:false});await expire(a);assert.equal((await status(a)).state,'expired');assert.equal('otpId' in await status(a),false);
 await q('update public.enlaces_registro set activo=false where id=$1',[LINK]);await assert.rejects(status(a),/OTP_LINK_NOT_ACTIVE/);
});
test('metrics count unique reservations, verifications and retained money without PII or delivered claims',async()=>{
 await enable();const a=await reserve();await finish(a,'accepted',{cost:39});await reserve({request:a.requestId});
 await q('update public.otp_codigos set verificado=true where id=$1',[a.otpId]);
 const metrics=await asService(()=>value("select public.nova_client_otp_metrics(now()-interval '1 hour',now()+interval '1 second')"));
 const row=metrics.channels[0];assert.equal(row.requested,1);assert.equal(row.accepted,1);assert.equal(row.verified,1);assert.equal(Number(row.budgetReservedCop),39);assert.equal(Number(row.costReportedCop),39);
 const text=JSON.stringify(metrics);for(const secret of [PHONE,DOC,a.requestId,a.otpId,'fixture-provider','delivered'])assert.equal(text.includes(secret),false);
});
test('real existing resume/seed contracts recover original IDs and saved photos after an SMS OTP',async()=>{
 const oldOtp=await original(PHONE);await q("update public.otp_codigos set verificado=true,created_at=now()-interval '1 day',expira_at=now()-interval '1 day',envio_aceptado_at=now()-interval '1 day' where id=$1",[oldOtp]);
 await enable();const a=await reserve();await finish(a,'accepted');await q('update public.otp_codigos set verificado=true where id=$1',[a.otpId]);
 const src='50000000-0000-4000-8000-000000000005',client='60000000-0000-4000-8000-000000000006';
 await q('insert into public.clientes values($1,$2,$3)',[client,DOC,PHONE]);
 await q('insert into public.kora_nova_sources(solicitud_id,cliente_id,otp_id,registration) values($1,$2,$3,$4)',[src,client,oldOtp,{p_cedula:DOC,p_celular:PHONE,p_origen_codigo:'CK-01',p_nombre_completo:'Fixture customer'}]);
 for(const type of ['frente','reverso','selfie'])await q('insert into public.documentos_solicitud values($1,$2,$3,$4)',[src,type,'1'.repeat(64),'fixture/'+type+'.jpg']);
 const before=(await q('select * from public.documentos_solicitud order by tipo')).rows;
 const hashes=Object.fromEntries(['frente','reverso','selfie'].map(t=>[t,'1'.repeat(64)]));
 const results=Object.fromEntries(['frente','reverso','selfie'].map(t=>[t,{status:'auto_approved',issues:[]}]))
 await q('insert into public.nova_retail_photo_reviews(otp_id,subject_hash,hashes,results) values($1,$2,$3,$4)',[oldOtp,'3'.repeat(64),hashes,results]);
 const resumed=await asService(()=>value('select public.kora_nova_retail_resume($1,$2,$3,$4)',[a.otpId,LINK,DOC,PHONE]));
 assert.equal(resumed.found,true);assert.equal(resumed.sourceId,src);assert.equal(resumed.clientId,client);assert.equal(resumed.sourceOtp,oldOtp);assert.notEqual(resumed.sourceOtp,a.otpId);assert.equal(resumed.incomplete,false);assert.equal(resumed.savedTypes.length,3);
 await asService(()=>value('select public.kora_nova_retail_seed_photos($1,$2,$3)',[src,a.otpId,'2'.repeat(64)]));
 assert.deepEqual((await q('select * from public.documentos_solicitud order by tipo')).rows,before);
 assert.deepEqual(await value('select results from public.nova_retail_photo_reviews where otp_id=$1',[oldOtp]),results);
 assert.equal(Number(await value('select count(*) from public.kora_nova_sources')),1);
});

// Pilot assertions use the same real SQL fixture; ordinary regression cases above
// explicitly use active mode to retain the original general ceilings.
const PILOT_OTHER_PHONE='3000000002';
const rows=()=>value('select count(*) from public.otp_codigos');
const enablePhone=()=>q('update public.nova_client_otp_policy set enabled=true,pilot_allowed_phones=$1::text[]',[[PHONE]]);
const pilotTest=(name,fn)=>test(name,async()=>{
 await db.exec("update public.nova_client_otp_policy set mode='pilot',enabled=false,pilot_allowed_phones='{}',daily_sms_limit=1,monthly_sms_limit=1,monthly_budget_cop=39");
 return fn();
});

pilotTest('candidate defaults are disabled pilot with empty phone scope and caps1/1/39',async()=>{
 assert.equal(initialPolicy.enabled,false);assert.equal(initialPolicy.mode,'pilot');assert.deepEqual(initialPolicy.pilot_allowed_phones,[]);
 assert.equal(initialPolicy.daily_sms_limit,1);assert.equal(initialPolicy.monthly_sms_limit,1);assert.equal(Number(initialPolicy.monthly_budget_cop),39);
 await assert.rejects(reserve(),/SMS_DISABLED/);assert.equal(Number(await rows()),0);
});
pilotTest('enabling an empty pilot still sends nothing and creates no OTP or ledger',async()=>{
 await db.exec('update public.nova_client_otp_policy set enabled=true');
 await assert.rejects(reserve(),/SMS_PILOT_LIMITED/);assert.equal(Number(await rows()),0);
 assert.equal((await options(PHONE)).smsEnabled,false);assert.equal((await options()).smsEnabled,false);
});
pilotTest('other phone is rejected before OTP/budget insertion even with a valid active link',async()=>{
 await enablePhone();await assert.rejects(reserve({phone:PILOT_OTHER_PHONE}),/SMS_PILOT_LIMITED/);
 assert.equal(Number(await rows()),0);assert.equal(Number(await value('select count(*) from public.nova_client_otp_dispatch')),0);
 assert.equal((await options(PILOT_OTHER_PHONE)).smsEnabled,false);assert.equal((await options(PHONE)).smsEnabled,true);
});
pilotTest('one authorized pilot reservation consumes cap even when failed; no automatic second try',async()=>{
 await enablePhone();const a=await reserve();assert.equal(a.canSend,true);assert.equal(Number(a.reservedCostCop),39);
 await finish(a,'failed');await expire(a);await assert.rejects(reserve(),/SMS_BUDGET_LIMIT/);
 assert.equal(Number(await rows()),1);assert.equal(Number(await value('select sum(reserved_cost_cop) from public.nova_client_otp_dispatch')),39);
 assert.equal((await reserve({phone:PHONE,request:a.requestId})).canSend,false);
});
pilotTest('service cannot edit pilot destination, mode or budget; options has only the two-argument defaulted signature',async()=>{
 for(const sql of ["update public.nova_client_otp_policy set mode='active'","update public.nova_client_otp_policy set pilot_allowed_phones=array['3000000002']","update public.nova_client_otp_policy set monthly_budget_cop=3900"])
   await asService(()=>assert.rejects(db.exec(sql),/permission denied/));
 const funcs=(await q("select pronargs,pronargdefaults,prosecdef,has_function_privilege('anon',oid,'execute') anon from pg_proc where proname='nova_client_otp_options'")).rows;
 assert.equal(funcs.length,1);assert.equal(funcs[0].pronargs,2);assert.equal(funcs[0].pronargdefaults,1);assert.equal(funcs[0].prosecdef,false);assert.equal(funcs[0].anon,false);
 await enablePhone();assert.equal((await options()).smsEnabled,false);assert.equal((await options(null)).smsEnabled,false);
});
pilotTest('pilot array accepts at most one canonical Colombian phone, not null/multidimensional/bound tricks',async()=>{
 for(const expr of ["array['3000000001','3000000002']","array[null]::text[]","array['+573000000001']","array['0000000000']","array[array['3000000001']]","'[0:0]={3000000001}'::text[]"])
   await assert.rejects(db.exec('update public.nova_client_otp_policy set pilot_allowed_phones='+expr),/check constraint/);
 await enablePhone();assert.deepEqual(await value('select pilot_allowed_phones from public.nova_client_otp_policy'),[PHONE]);
});
pilotTest('options and metrics never return the pilot phone or phone allowlist',async()=>{
 await enablePhone();await reserve();
 const option=await options(PHONE),metrics=await asService(()=>value("select public.nova_client_otp_metrics(now()-interval '1 hour',now()+interval '1 second')"));
 const out=JSON.stringify({option,metrics});assert.equal(out.includes(PHONE),false);assert.equal(out.includes(PILOT_OTHER_PHONE),false);assert.equal(out.includes('pilot_allowed_phones'),false);
 assert.equal(metrics.channels[0].requested,1);
});
pilotTest('active mode is an explicit administrative switch and keeps the general ceilings',async()=>{
 await enablePhone();await db.exec("update public.nova_client_otp_policy set mode='active',daily_sms_limit=10,monthly_sms_limit=100,monthly_budget_cop=3900");
 assert.equal((await options()).smsEnabled,true);assert.equal((await options(PILOT_OTHER_PHONE)).smsEnabled,true);assert.equal((await reserve({phone:PILOT_OTHER_PHONE})).canSend,true);
 await assert.rejects(db.exec('update public.nova_client_otp_policy set monthly_sms_limit=101'),/check constraint/);
});
pilotTest('admin can authorize another pilot attempt without refunding or erasing the first; phone scope remains',async()=>{
 await enablePhone();const a=await reserve();await finish(a,'failed');await expire(a);
 await db.exec('update public.nova_client_otp_policy set daily_sms_limit=2,monthly_sms_limit=2,monthly_budget_cop=78');
 const b=await reserve();assert.equal(b.canSend,true);assert.notEqual(a.otpId,b.otpId);
 assert.equal(await value('select mode from public.nova_client_otp_policy'),'pilot');
 assert.equal(Number(await value('select count(*) from public.nova_client_otp_dispatch')),2);
 assert.equal(Number(await value('select sum(reserved_cost_cop) from public.nova_client_otp_dispatch')),78);
 await assert.rejects(reserve({phone:PILOT_OTHER_PHONE}),/SMS_PILOT_LIMITED/);
});

import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {NativePostgres} from './native-postgres.mjs';
const container=process.env.NOVA_SQL_NATIVE_CONTAINER;
const db=new NativePostgres(container);
const LINK='10000000-0000-4000-8000-000000000001',OTHER='10000000-0000-4000-8000-000000000002';
const PHONE='3000000001',PHONE2='3000000002';
const sha=async()=>createHash('sha256').update(await readFile(new URL('../../../supabase/migrations/20261030180052_nova_client_sms_otp_budget.sql',import.meta.url))).digest('hex');
const initialSha=await sha(),results=[];
function launch(sql,{ready=false}={}){
 const child=spawn('docker',['--context','colima','exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{stdio:['pipe','pipe','pipe']});
 let stdout='',stderr='',resolveReady,rejectReady;
 const readiness=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
 child.stdout.on('data',b=>{stdout+=b;if(stdout.includes('NATIVE_LOCK_READY'))resolveReady();});
 child.stderr.on('data',b=>{stderr+=b;});
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>{
   if(ready&&!stdout.includes('NATIVE_LOCK_READY'))rejectReady(Error(stderr||'No lock marker'));
   resolve({code,stdout,stderr});
 });});
 child.stdin.end("set statement_timeout='5s';set lock_timeout='4s';\n"+sql+'\n');
 return {ready:readiness,done};
}
const reserveSQL=(req,phone=PHONE,link=LINK,channel='sms')=>`select public.nova_client_otp_reserve('100001','${phone}','${link}','${req}','${channel}',${channel==='sms'?"'no_whatsapp'":'null'},'${'A'.repeat(43)}',now()+interval '4 minutes');`;
const held=sql=>`begin;set local role service_role;${sql}\n\\echo NATIVE_LOCK_READY\nselect pg_sleep(0.6);commit;`;
const json=out=>JSON.parse(out.stdout.split('\n').find(line=>line.startsWith('{')));
async function reset(){await db.exec(`truncate public.nova_client_otp_dispatch,public.nova_retail_photo_reviews,public.documentos_solicitud,
public.nova_retail_cases,public.kora_nova_sources,public.clientes,public.otp_codigos cascade;
update public.nova_client_otp_policy set mode='active',enabled=true,daily_sms_limit=10,monthly_sms_limit=100,monthly_budget_cop=3900;`);}
async function compete(first,second){
 const a=launch(held(first),{ready:true});await a.ready;
 const started=Date.now(),b=launch('set role service_role;'+second);
 const [ar,br]=await Promise.all([a.done,b.done]);
 assert.equal(ar.code,0,ar.stderr);assert.ok(Date.now()-started>=300,'Second connection must actually wait for held transaction');
 return {a:ar,b:br,waitedMs:Date.now()-started};
}
async function check(name,fn){await reset();const detail=await fn();results.push({name,passed:true,...detail});}

await check('same request in two sessions grants only one send',async()=>{
 const request=randomUUID(),r=await compete(reserveSQL(request),reserveSQL(request));
 assert.equal(r.b.code,0,r.b.stderr);assert.equal(json(r.a).canSend,true);assert.equal(json(r.b).canSend,false);
 assert.equal(json(r.a).otpId,json(r.b).otpId);return {waitedMs:r.waitedMs};
});
await check('legacy WA caller waiting behind SMS is blocked by additive trigger',async()=>{
 const r=await compete(reserveSQL(randomUUID()),`select otp_id from public.reservar_otp_registro_seguro('100001','${PHONE}','${LINK}','${'B'.repeat(43)}',now()+interval '4 minutes');`);
 assert.notEqual(r.b.code,0);assert.match(r.b.stderr,/OTP_ACTIVE/);return {waitedMs:r.waitedMs};
});
await check('legacy boolean FAILED committed first still blocks waiting SMS wrapper',async()=>{
 const old=`select otp_id from public.reservar_otp_registro_seguro('100001','${PHONE}','${LINK}','${'B'.repeat(43)}',now()+interval '4 minutes');update public.otp_codigos set envio_fallido_at=now() where celular='${PHONE}';`;
 const r=await compete(old,reserveSQL(randomUUID()));assert.notEqual(r.b.code,0);assert.match(r.b.stderr,/OTP_ACTIVE/);return {waitedMs:r.waitedMs};
});
await check('global budget serializes different phones and different links',async()=>{
 await db.exec('update public.nova_client_otp_policy set daily_sms_limit=1');
 const r=await compete(reserveSQL(randomUUID()),reserveSQL(randomUUID(),PHONE2,OTHER));
 assert.notEqual(r.b.code,0);assert.match(r.b.stderr,/SMS_BUDGET_LIMIT/);return {waitedMs:r.waitedMs};
});
await check('cost anomaly finish is visible before a competing new SMS reservation',async()=>{
 const req=randomUUID();const a=(await db.query(reserveSQL(req))).rows[0].nova_client_otp_reserve;
 const final=`select public.nova_client_otp_finish('${req}','${a.attemptId}','accepted','fixture-anomaly',null,40);`;
 const r=await compete(final,reserveSQL(randomUUID(),PHONE2,OTHER));
 assert.notEqual(r.b.code,0);assert.match(r.b.stderr,/SMS_COST_ANOMALY/);return {waitedMs:r.waitedMs};
});
const receipt={timestampUTC:new Date().toISOString(),engine:(await db.query('select version() as version')).rows[0].version,
 sqlSha256:initialSha,sqlUnchanged:initialSha===await sha(),tests:results.length,pass:results.filter(r=>r.passed).length,
 connections:'Two simultaneous native PostgreSQL sessions for each contention case',results,productionDDL:false,providerCalls:false};
receipt.passed=receipt.tests===5&&receipt.pass===5&&receipt.sqlUnchanged;
await writeFile(new URL('./native-concurrency-receipt.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
if(!receipt.passed)process.exitCode=1;

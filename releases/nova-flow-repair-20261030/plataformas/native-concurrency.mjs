import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NativePostgres} from './native-postgres.mjs';
import {prepareDatabase,id,migration} from './fixture.mjs';
const container=process.env.NOVA_SQL_NATIVE_CONTAINER;
const db=new NativePostgres(container),results=[];
const migrationHash=createHash('sha256').update(migration).digest('hex');
function launch(sql,{ready=false}={}){
 const child=spawn('docker',['--context','colima','exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{stdio:['pipe','pipe','pipe']});
 let stdout='',stderr='',resolveReady,rejectReady;
 const readiness=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
 child.stdout.on('data',b=>{stdout+=b;if(stdout.includes('NATIVE_LOCK_READY'))resolveReady();});
 child.stderr.on('data',b=>{stderr+=b;});
 const done=new Promise((resolve,reject)=>{child.on('error',error=>{rejectReady(error);reject(error);});child.on('close',code=>{
  if(ready&&!stdout.includes('NATIVE_LOCK_READY'))rejectReady(Error(stderr||'No lock marker'));
  resolve({code,stdout,stderr});
 });});
 child.stdin.end("set statement_timeout='8s';set lock_timeout='6s';\n"+sql+'\n');
 return {ready:readiness,done};
}
const approval="select public.nova_retail_review('"+id.source+"',1,'"+id.actor+"','approve','Prueba concurrente local');";
const customerRevoke="update public.clientes set autorizacion_datos=false where id='"+id.client+"';";
const sourceRevoke="update public.kora_nova_sources set revoked_at=now() where solicitud_id='"+id.source+"';";
const held=(sql,service)=>'begin;'+(service?'set local role service_role;':'')+sql+"\n\\echo NATIVE_LOCK_READY\nselect pg_sleep(0.8);commit;";
async function compete(first,second,{firstService=false,secondService=true}={}){
 const a=launch(held(first,firstService),{ready:true});await a.ready;
 const started=Date.now(),b=launch((secondService?'set role service_role;':'')+second);
 const [ar,br]=await Promise.all([a.done,b.done]);
 assert.equal(ar.code,0,ar.stderr);
 const waitedMs=Date.now()-started;assert.ok(waitedMs>=350,'Second connection must wait on a real held row lock');
 return {a:ar,b:br,waitedMs};
}
async function run(name,fn){
 await prepareDatabase(db,{enabled:true});
 const detail=await fn();results.push({name,passed:true,...detail});
}
await run('customer revocation committed before approval prevents manual approval',async()=>{
 const r=await compete(customerRevoke,approval);assert.notEqual(r.b.code,0);assert.match(r.b.stderr,/CONSENT_REVOKED/);
 const state=(await db.query('select state,revision from public.nova_retail_cases')).rows[0];assert.deepEqual(state,{state:'review',revision:1});
 return {waitedMs:r.waitedMs,approval:'CONSENT_REVOKED'};
});
await run('source revocation committed before approval prevents manual approval',async()=>{
 const r=await compete(sourceRevoke,approval);assert.notEqual(r.b.code,0);assert.match(r.b.stderr,/CONSENT_REVOKED/);
 return {waitedMs:r.waitedMs,approval:'CONSENT_REVOKED'};
});
for(const [kind,revoke]of[['customer',customerRevoke],['source',sourceRevoke]])await run('approval preceding '+kind+' revocation serializes and is invalidated on reconcile',async()=>{
 const r=await compete(approval,revoke,{firstService:true,secondService:false});assert.equal(r.b.code,0,r.b.stderr);
 const before=(await db.query('select state,revision,summary from public.nova_retail_cases')).rows[0];assert.equal(before.state,'authorized');
 const saved=(await db.query('select public.nova_retail_save($1,$2,$3,$4) r',[id.source,'b'.repeat(64),{state:'authorized',canProcess:true,reasons:[]},before.summary])).rows[0].r;
 assert.equal(saved.state,'review');assert.deepEqual(saved.decision.reasons,['consent_revoked']);assert.deepEqual(saved.summary,before.summary);
 const events=(await db.query("select count(*)::int n from public.nova_retail_case_events where action='review_approve'")).rows[0];assert.equal(events.n,1);
 return {waitedMs:r.waitedMs,priorApprovalRetainedInHistory:true,reconciledState:saved.state};
});
const receipt={timestampUTC:new Date().toISOString(),engine:(await db.query('select version() version')).rows[0].version,sqlSha256:migrationHash,tests:results.length,pass:results.filter(r=>r.passed).length,fail:0,results,connections:'Two simultaneous native PostgreSQL sessions per race; no TCP, ports or mounts',productionDDL:false,providerCalls:false};
await writeFile(new URL('./native-concurrency-receipt.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));


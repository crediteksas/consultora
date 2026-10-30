import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NativePostgres} from '../plataformas/native-postgres.mjs';
import {schema,predecessors,migration,ids} from './otp-fixture.mjs';

const container=process.env.NOVA_SQL_NATIVE_CONTAINER;
if(!/^nova-flow-sql-[A-Za-z0-9-]+$/.test(container||''))throw Error('INVALID_TEST_CONTAINER');
const databaseName='nova_otp_flow_20261030';
class OtpNative extends NativePostgres{
 run(sql){
  const result=spawnSync('docker',['--context','colima','exec','-i',this.container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',databaseName],
   {input:(this.role?'set role '+this.role+';\n':'')+sql,encoding:'utf8'});
  if(result.status!==0)throw Error((result.stderr||result.error?.message||'native-test-query-failed').trim());
  return result.stdout.trim();
 }
}
const admin=new NativePostgres(container);
if(!admin.run("select 1 from pg_database where datname='"+databaseName+"'"))admin.run('create database '+databaseName+';');
const db=new OtpNative(container);
async function prepare(){
 await db.exec('drop schema public cascade;create schema public;');
 await db.exec("do $roles$ begin if not exists(select from pg_roles where rolname='anon')then create role anon;end if;if not exists(select from pg_roles where rolname='authenticated')then create role authenticated;end if;if not exists(select from pg_roles where rolname='service_role')then create role service_role;end if;end $roles$;");
 await db.exec(schema);
 for(const f of predecessors)await db.exec(f.definition.trimEnd()+';');
 await db.exec('create trigger nova_client_otp_guard_sms before insert on public.otp_codigos for each row execute function public.nova_client_otp_guard_sms();');
 for(const f of predecessors)await db.exec('revoke all on function public.'+f.signature+' from public,anon,authenticated;grant execute on function public.'+f.signature+' to service_role;');
 await db.exec('grant usage on schema public to service_role;grant select,insert,update on all tables in schema public to service_role;');
 await db.exec(migration);
}
function launch(sql,{ready=false}={}){
 const child=spawn('docker',['--context','colima','exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',databaseName],{stdio:['pipe','pipe','pipe']});
 let stdout='',stderr='',resolveReady,rejectReady;
 const readiness=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject});
 child.stdout.on('data',b=>{stdout+=b;if(stdout.includes('NATIVE_OTP_LOCK_READY'))resolveReady();});child.stderr.on('data',b=>{stderr+=b;});
 const done=new Promise((resolve,reject)=>{child.on('error',error=>{rejectReady(error);reject(error)});child.on('close',code=>{if(ready&&!stdout.includes('NATIVE_OTP_LOCK_READY'))rejectReady(Error(stderr||'Lock marker absent'));resolve({code,stdout,stderr});});});
 child.stdin.end("set statement_timeout='8s';set lock_timeout='6s';\n"+sql+'\n');
 return {ready:readiness,done};
}
const reserve=link=>"select * from public.reservar_otp_registro_seguro('12345678','3000000000','"+link+"',repeat('A',43),now()+interval '5 minutes');";
const sms=link=>"with challenge as (insert into public.otp_codigos(cedula,celular,enlace_registro_id,codigo_hash,expira_at) values('12345678','3000000000','"+link+"',repeat('B',43),now()+interval '5 minutes') returning id) insert into public.nova_client_otp_dispatch(otp_id,channel) select id,'sms' from challenge;";
const results=[];
for(const [name,first,second]of[
 ['WA/WA same phone and context',reserve(ids.a),reserve(ids.a)],
 ['WA/SMS same phone different context',reserve(ids.a),sms(ids.b)],
 ['SMS/WA same phone different context',sms(ids.a),reserve(ids.b)]
]){
 await prepare();
 const a=launch("begin;set local role service_role;"+first+"\n\\echo NATIVE_OTP_LOCK_READY\nselect pg_sleep(0.9);commit;",{ready:true});await a.ready;
 const started=Date.now(),b=launch("set role service_role;"+second);
 const [ar,br]=await Promise.all([a.done,b.done]);assert.equal(ar.code,0,ar.stderr);assert.notEqual(br.code,0);assert.match(br.stderr,/OTP_ACTIVE/);
 const waitedMs=Date.now()-started;assert.ok(waitedMs>=350,'Second connection must wait for transaction lock');
 const state=(await db.query('select count(*)::int rows,count(*)filter(where not verificado and registro_consumido_at is null and expira_at>now())::int active from public.otp_codigos')).rows[0];
 assert.deepEqual(state,{rows:1,active:1});results.push({name,passed:true,waitedMs,secondResult:'OTP_ACTIVE',activeRows:state.active});
}
const receipt={timestampUTC:new Date().toISOString(),engine:(await db.query('select version() version')).rows[0].version,sqlSha256:createHash('sha256').update(migration).digest('hex'),
 fixtureDatabase:databaseName,tests:results.length,passed:results.length,failed:0,results,connections:'Two simultaneous native PostgreSQL sessions per test via local docker exec, isolated fixture database',
 realProviderCalls:0,realMessages:0,productionWrites:0,smsApiCalls:0};
await writeFile(new URL('./otp-native-concurrency-receipt.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));


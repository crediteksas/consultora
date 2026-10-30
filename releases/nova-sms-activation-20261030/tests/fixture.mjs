import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {harness as legacyHarness,tokens,ids,candidate as priorOtpSource} from '../../nova-flow-repair-20261030/clientes/otp-fixture.mjs';
import {fixture as formFixture,candidate as priorForm} from '../../nova-flow-repair-20261030/clientes/ui-tests/form-harness.mjs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'/Users/oscarm/Creditek/baseline/consultora/node_modules/@electric-sql/pglite/dist/index.js');
const root=new URL('../',import.meta.url);
export const original=await readFile(new URL('baseline/index.mjs',root),'utf8'),candidate=await readFile(new URL('deploy/index.mjs',root),'utf8'),form=await readFile(new URL('baseline/form.html',root),'utf8');
const actual=(source,name)=>{let a=source.indexOf('async function '+name+'(');if(a<0)a=source.indexOf('function '+name+'(');const b=source.indexOf('\n__name('+name+',',a);assert.ok(a>=0&&b>a,name);return source.slice(a,b);};
const script=html=>[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).find(x=>x.includes('function preparedQualityPhotos()'));
assert.equal(script(form),script(priorForm),'DOM harness executes exact deployed form main script');
assert.equal(actual(original,'sendSecureOtp2'),actual(priorOtpSource,'sendSecureOtp2'),'Legacy transport fixture must execute the exact current sender');
export {tokens,ids};
export async function setup({source=candidate,flag=true,options={}}={}){
 const db=new PGlite(),counts={managedMeta:0,managedReserve:0,managedCaptcha:0,plain:0},used=new Set();
 await db.exec(await readFile(new URL('tests/fixture.sql',root),'utf8'));
 await db.exec(await readFile(new URL('tests/policy-fixture.sql',root),'utf8'));
 await db.exec(await readFile(new URL('tests/live-otp-functions.sql',root),'utf8'));
 await db.exec("create trigger nova_client_otp_guard_sms before insert on public.otp_codigos for each row execute function public.nova_client_otp_guard_sms();revoke all on all functions in schema public from public,anon,authenticated;grant execute on all functions in schema public to service_role;");
 await db.query("insert into public.origenes(codigo) values('CK-01');");
 await db.query("insert into public.enlaces_registro(id,origen_codigo,token_hash) values($1,'CK-01','synthetic-only')",[ids.a]);
 await db.exec("update public.nova_client_otp_policy set enabled=true,pilot_allowed_phones=array['3000000009'];");
 const legacy=await legacyHarness(db,options);
 const order={nova_client_otp_options:['p_enlace_registro_id','p_celular'],nova_client_otp_reserve:['p_cedula','p_celular','p_enlace_registro_id','p_request_id','p_channel','p_selected_reason','p_codigo_hash','p_expira_at'],
 nova_client_otp_finish:['p_request_id','p_attempt_id','p_status','p_provider_message_id','p_error_code','p_reported_cost_cop'],nova_client_otp_status:['p_request_id','p_cedula','p_celular','p_enlace_registro_id']};
 const fetcher=async(url,opts={})=>{
  const u=new URL(String(url));
  if(u.hostname==='graph.facebook.com'){counts.managedMeta++;return Response.json({messages:[{id:'wamid.fixture-accepted'}]});}
  assert.equal(u.hostname,'local.invalid','No real provider or network destination');
  const name=u.pathname.split('/').at(-1);assert.ok(order[name]);if(name==='nova_client_otp_reserve')counts.managedReserve++;
  const body=JSON.parse(opts.body);await db.exec('set role service_role');
  try{return Response.json((await db.query('select public.'+name+'('+order[name].map((_,i)=>'$'+(i+1)).join(',')+') value',order[name].map(k=>body[k]??null))).rows[0].value);}
  catch(error){return Response.json({message:error.message},{status:400});}finally{await db.exec('reset role');}
 };
 const env={NOVA_SMS_ENABLED:String(flag),ALLOW_LEGACY_REGISTRATION_LINKS:'true',INALAMBRIA_SMS_API_KEY:'sk_test_fixture_never_real',PHONE_NUMBER_ID:'12345678',WHATSAPP_TOKEN:'fixture-only',TOKEN_HASH_SECRET:'fixture-only',TURNSTILE_SECRET_KEY:'fixture-only'};
 const deps={fetcher,supabaseUrl:'https://local.invalid',headers:()=>({}),resolveContext:async()=>({ok:true,enlaceId:ids.a}),now:()=>Date.now(),generateCode:()=> '123456',hash:async()=> 'A'.repeat(43),
 verifyTurnstile:async token=>{counts.managedCaptcha++;const valid=!used.has(token);used.add(token);return valid;}};
 const sandbox={crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,AbortSignal,Date,WeakMap,fetch:()=>{throw Error('Implicit fetch forbidden');},
 json22:(body,status=200)=>Response.json(body,{status}),smsOtpDependencies:()=>deps,sendSecureOtp2:input=>legacy.send(input),
 handleOtpEnviar2:async request=>{counts.plain++;const body=await request.json();assert.equal(body.celular,'3000000000');return Response.json({legacy:true});},__name:f=>f,__name2222:f=>f};
 vm.createContext(sandbox);
 vm.runInContext(source.slice(0,source.indexOf('// releases/nova-client-sms-20261030/candidate-entry.mjs')),sandbox);
 for(const name of ['isRecord4','hasOwn3','isSecureOtpSendRequest2','requestJson2','handleOtpEnviarRoute2'])vm.runInContext(actual(source,name),sandbox);
 const post=async(body)=>{const request=new Request('https://fixture.invalid/api/otp/enviar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const response=await sandbox.handleOtpEnviarRoute2(request,env);return {status:response.status,body:await response.json()};};
 const standard=(extra={})=>({enlace_token:tokens.a,cedula:'12345678',celular:'3000000000',turnstile_token:'fresh-fixture-'+webcrypto.randomUUID(),...extra});
 const queryCounts=async()=>(await db.query("select count(*)::int challenges,count(*)filter(where envio_aceptado_at is not null)::int accepted from public.otp_codigos")).rows[0];
 const totals=()=>({meta:counts.managedMeta+legacy.counts.meta,reserves:counts.managedReserve+legacy.counts.reserves});
 const formScenario=async({lostFirst=true}={})=>{
  const responses=[];let posts=0;
  const f=formFixture(async(path,body)=>{
   if(path==='/api/otp/opciones'){const result=await sandbox.managedOtpOptions(body,env,deps);assert.equal(result.body.smsEnabled,false);return {status:result.status,data:result.body};}
   assert.equal(path,'/api/otp/enviar');assert.equal(body.request_id,undefined);assert.equal(body.channel,undefined);posts++;
   const result=await post(body);responses.push(result);if(posts===1&&lostFirst)throw Error('Synthetic accepted HTTP200 lost before browser');return {status:result.status,data:result.body};
  },{linkToken:tokens.a});
  await f.enable();await f.click('btnEnviarOtp');const before=f.nodes.get('codeRow').classList.contains('show');
  f.advance(16000);f.run("turnstileToken='fresh-manual-captcha-for-retry';evaluarEnvioOtp();");await f.click('btnEnviarOtp');f.assertFiles();
  return {responses,before,after:f.nodes.get('codeRow').classList.contains('show'),status:f.nodes.get('otpStatus').textContent,photosPreserved:true};
 };
 return {db,post,standard,formScenario,counts,totals,queryCounts,env};
}


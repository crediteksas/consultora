import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash,webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { transformClientesOtp } from './otp-transform.mjs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'/Users/oscarm/Creditek/baseline/consultora/node_modules/@electric-sql/pglite/dist/index.js');
export const baseline=await readFile(new URL('../baseline/clientes/index.mjs',import.meta.url),'utf8');
export const candidate=process.env.NOVA_REPAIR_CLIENTES_CANDIDATE?await readFile(process.env.NOVA_REPAIR_CLIENTES_CANDIDATE,'utf8'):transformClientesOtp(baseline);
export const predecessors=JSON.parse(await readFile(new URL('./otp-predecessor-functions.json',import.meta.url),'utf8'));
export const migration=await readFile(new URL('../../../supabase/migrations/20261030213906_nova_otp_active_challenge_guard.sql',import.meta.url),'utf8');
export const ids={a:'10000000-0000-4000-8000-000000000001',b:'20000000-0000-4000-8000-000000000002'};
export const tokens={a:'synthetic-a-registration-link-at-least32characters',b:'synthetic-b-registration-link-at-least32characters'};
export const schema=String.raw`
create table public.otp_codigos(id uuid primary key default gen_random_uuid(),cedula text,celular text,enlace_registro_id uuid,codigo_hash text,expira_at timestamptz,created_at timestamptz default now(),
intentos int default 0,verificado boolean default false,registro_consumido_at timestamptz,envio_aceptado_at timestamptz,envio_fallido_at timestamptz);
create table public.nova_client_otp_dispatch(otp_id uuid,channel text);
`;
export async function database({patched=true}={}){
 const db=new PGlite();
 await db.exec(schema);
 for(const f of predecessors){assert.equal(createHash('md5').update(f.definition).digest('hex'),f.definition_md5);await db.exec(f.definition.trimEnd()+';');}
 await db.exec("create trigger nova_client_otp_guard_sms before insert on public.otp_codigos for each row execute function public.nova_client_otp_guard_sms();");
 await db.exec('create role anon;create role authenticated;create role service_role;');
 for(const f of predecessors)await db.exec('revoke all on function public.'+f.signature+' from public,anon,authenticated;grant execute on function public.'+f.signature+' to service_role;');
 if(patched)await db.exec(migration);
 return db;
}
export const rows=async db=>(await db.query("select id,verificado,expira_at,registro_consumido_at,envio_aceptado_at,envio_fallido_at from public.otp_codigos order by created_at,id")).rows;
export async function reserve(db,{document='12345678',phone='3000000000',link=ids.a,hash='A'.repeat(43),expires=new Date(Date.now()+300000).toISOString()}={}){
 return (await db.query('select * from public.reservar_otp_registro_seguro($1,$2,$3,$4,$5::timestamptz)',[document,phone,link,hash,expires])).rows;
}
export async function harness(db,options={}){
 const counts={gets:0,reserves:0,patches:0,meta:0,captcha:0,generated:0},usedCaptchas=new Set(),events=[];
 let nextCaptcha=0;
 const tableFilters=(url)=>{
  const terms=[],values=[],allowed=new Set(['id','cedula','celular','enlace_registro_id','codigo_hash','verificado','registro_consumido_at','expira_at','envio_aceptado_at','envio_fallido_at']);
  for(const [key,value]of url.searchParams){if(['select','order','limit'].includes(key))continue;assert.ok(allowed.has(key),'Known bound filter: '+key);
   if(value==='is.null')terms.push(key+' is null');else if(value==='not.is.null')terms.push(key+' is not null');
   else{const m=/^(eq|gt)\.(.*)$/.exec(value);assert.ok(m,'Known filter operator');values.push(m[2]);terms.push(key+(m[1]==='eq'?'=':'>')+'$'+values.length);}
  }
  return {where:terms.length?terms.join(' and '):'true',values};
 };
 const mockFetch=async(input,request={})=>{
  const url=new URL(String(input)),body=request.body?JSON.parse(request.body):{};
  if(url.hostname==='challenges.cloudflare.com'){
   counts.captcha++;events.push('captcha');const valid=!usedCaptchas.has(body.response);usedCaptchas.add(body.response);
   return Response.json({success:valid,hostname:'registro.crediteksas.com',action:'registro-cliente'});
  }
  if(url.hostname==='graph.facebook.com'){
   assert.equal(request.method,'POST');counts.meta++;events.push('meta');
   if(options.meta==='timeout')throw Error('Synthetic Meta response lost');
   if(options.meta==='failed')return Response.json({error:{code:131026}},{status:400});
   return Response.json({messages:[{id:'fixture-message-'+counts.meta}]});
  }
  assert.equal(url.hostname,'local.invalid','Closed mock transport; never real network');
  if(url.pathname==='/rest/v1/rpc/reservar_otp_registro_seguro'){
   counts.reserves++;events.push('reserve');if(options.reserve==='before')throw Error('Reservation result unknown');
   try{
    const result=await reserve(db,{document:body.p_cedula,phone:body.p_celular,link:body.p_enlace_registro_id,hash:body.p_codigo_hash,expires:body.p_expira_at});
    if(options.reserve==='after')throw Error('Committed reservation response lost');
    return Response.json(result);
   }catch(error){
    if(options.reserve==='after')throw error;
    return Response.json({message:error.message},{status:409});
   }
  }
  assert.equal(url.pathname,'/rest/v1/otp_codigos','Known DB endpoint');
  if(request.method==='PATCH'){
   counts.patches++;events.push('patch');
   if(options.patch==='before')throw Error('Patch unavailable');
   const field=Object.keys(body)[0];assert.ok(['envio_aceptado_at','envio_fallido_at'].includes(field));assert.equal(Object.keys(body).length,1);
   const filter=tableFilters(url),values=[...filter.values,body[field]];
   const result=await db.query('update public.otp_codigos set '+field+'=$'+values.length+' where '+filter.where+' returning id',values);
   if(options.patch==='after')throw Error('Committed patch response lost');
   return Response.json(result.rows);
  }
  assert.ok(!request.method||request.method==='GET');counts.gets++;events.push('get');
  assert.equal(url.searchParams.get('select'),'id,expira_at,intentos,envio_aceptado_at,envio_fallido_at');
  assert.equal(request.redirect,'error');
  const filter=tableFilters(url),result=await db.query('select id,expira_at,intentos,envio_aceptado_at,envio_fallido_at from public.otp_codigos where '+filter.where+' order by created_at desc limit 1',filter.values);
  const normalized=result.rows.map(r=>({...r,expira_at:r.expira_at.toISOString(),envio_aceptado_at:r.envio_aceptado_at?.toISOString()??null,envio_fallido_at:r.envio_fallido_at?.toISOString()??null}));
  const scripted=await options.get?.({index:counts.gets,rows:normalized,url,db});
  if(scripted!==undefined)return scripted;
  return Response.json(normalized);
 };
 const extract=name=>{const m=candidate.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n\\}\\n__name\\('));assert.ok(m,name);return m[0].slice(0,m[0].lastIndexOf('\n__name('));};
 const backend=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Uint32Array,AbortSignal,atob,btoa,URL,Date,fetch:mockFetch,console:{error(){},log(){}}});
 vm.runInContext("var encoder3=new TextEncoder();var decoder2=new TextDecoder();var HMAC_LENGTH_BYTES2=32;var SUPABASE_URL22='https://local.invalid';var OTP_TTL_MS2=300000;var TURNSTILE_VERIFY_URL2='https://challenges.cloudflare.com/turnstile/v0/siteverify';var TURNSTILE_HOSTNAME2='registro.crediteksas.com';var TURNSTILE_ACTION2='registro-cliente';var OTP_TEMPLATE_NAME2='fixture';var OTP_TEMPLATE_LANG2='es';",backend);
 backend.resolveContext2=async(token)=>{events.push('context');return token===tokens.a?{ok:true,enlaceId:ids.a}:token===tokens.b?{ok:true,enlaceId:ids.b}:{ok:false,response:{status:404,body:{ok:false,error:'Invalid fixture link'}}};};
 for(const name of ['result4','isRecord4','isCedula2','isCelular2','isSecureSendInput2','isOtpReservationRow2','supabaseHeaders2','otpUrl2','verifyTurnstile2','base64url2','importHmacKey2','hmac2','hashOpaqueToken2','reserveOtp2','deliveryFilters2','isExactUpdatedRow2','closeDelivery2','patchOtp2','readOtpRows2','sendSecureOtp2','enviarPlantillaOtp2'])vm.runInContext(extract(name),backend);
 const helperStart=candidate.indexOf('async function novaActiveOtp2('),helperEnd=candidate.indexOf('async function sendSecureOtp2(',helperStart);
 assert.ok(helperStart>=0&&helperEnd>helperStart);vm.runInContext(candidate.slice(helperStart,helperEnd),backend);
 const env={NOVA_SMS_ENABLED:'false',TOKEN_HASH_SECRET:'fixture-only-not-a-real-secret',TURNSTILE_SECRET_KEY:'fixture-only',SUPABASE_SERVICE_KEY:'fixture-only',PHONE_NUMBER_ID:'fixture-only',WHATSAPP_TOKEN:'fixture-only'};
 backend.fixtureEnv=env;
 const send=async(overrides={})=>{
  const input={enlace_token:tokens.a,cedula:'12345678',celular:'3000000000',turnstile_token:'fresh-fixture-captcha-'+(++nextCaptcha),...overrides};
  backend.fixtureInput=input;backend.fixtureDeps={now:()=>Date.now(),generateCode:()=>String(100000+(++counts.generated)),fetcher:mockFetch,
   sendOtp:(phone,code)=>backend.enviarPlantillaOtp2(phone,code,env)};
  return backend.sendSecureOtp2(input,null,env,backend.fixtureDeps);
 };
 return {send,counts,events,usedCaptchas,backend,env};
}


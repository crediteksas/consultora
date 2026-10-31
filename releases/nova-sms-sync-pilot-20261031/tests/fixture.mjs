import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
const {PGlite}=await import('/Users/oscarm/Creditek/baseline/consultora/node_modules/@electric-sql/pglite/dist/index.js');
export const baseline=await readFile(new URL('../../nova-otp-delivery-20261031/deploy/clientes/index.mjs',import.meta.url),'utf8');
export const candidate=await readFile(new URL('../deploy/clientes/index.mjs',import.meta.url),'utf8');
export const baselineForm=await readFile(new URL('../../nova-otp-delivery-20261031/deploy/clientes/form.html',import.meta.url),'utf8');
export const candidateForm=await readFile(new URL('../deploy/clientes/form.html',import.meta.url),'utf8');
export const ids={link:'10000000-0000-4000-8000-000000000001',request:'20000000-0000-4000-8000-000000000002',otherRequest:'20000000-0000-4000-8000-000000000003',consumption:'50000000-0000-4000-8000-000000000005'};
export const input={enlace_token:'synthetic-registration-link-token-at-least32',cedula:'12345678',celular:'3000000000',turnstile_token:'synthetic-captcha',request_id:ids.request,channel:'sms',sms_reason:'no_whatsapp'};
export function actual(source,name){let start=source.indexOf('async function '+name+'(');if(start<0)start=source.indexOf('function '+name+'(');const end=source.indexOf('\n__name('+name+',',start);assert.ok(start>=0&&end>start,'actual published helper '+name);return source.slice(start,end);}
const order={nova_client_otp_options:['p_enlace_registro_id','p_celular'],nova_client_otp_reserve:['p_cedula','p_celular','p_enlace_registro_id','p_request_id','p_channel','p_selected_reason','p_codigo_hash','p_expira_at'],nova_client_otp_finish:['p_request_id','p_attempt_id','p_status','p_provider_message_id','p_error_code','p_reported_cost_cop'],nova_client_otp_status:['p_request_id','p_cedula','p_celular','p_enlace_registro_id'],nova_otp_delivery_read:['p_cedula','p_celular','p_enlace_registro_id','p_otp_id']};
export async function fixture({source=candidate,enabled=true,status=200,delayMs=0,providerBody=null,loseFinish=false,pauseDuringProvider=false,envFlag=true,keyValid=true}={}){
 const db=new PGlite(),counts={rpc:{},provider:0,meta:0,unexpected:0,captcha:0,generated:0},timeouts=[];let clock=Date.now(),finishLoss=loseFinish;
 try{
 for(const file of ['fixture.sql','policy-fixture.sql','live-otp-functions.sql'])await db.exec(await readFile(new URL('../../nova-sms-activation-20261030/tests/'+file,import.meta.url),'utf8'));
 await db.exec("create trigger nova_client_otp_guard_sms before insert on public.otp_codigos for each row execute function public.nova_client_otp_guard_sms();revoke all on all functions in schema public from public,anon,authenticated;grant execute on all functions in schema public to service_role;");
 await db.exec(await readFile(new URL('../../nova-otp-delivery-20261031/sql/20261031164956_nova_otp_delivery_receipts.sql',import.meta.url),'utf8'));
 await db.exec("insert into public.origenes(codigo) values('CK-05');");
 await db.query("insert into public.enlaces_registro(id,origen_codigo,token_hash) values($1,'CK-05','synthetic-link-hash-not-a-real-secret')",[ids.link]);
 await db.exec("update public.nova_client_otp_policy set enabled="+String(enabled)+",mode='pilot',pilot_allowed_phones=array['3000000000'],allowed_origins=array['CK-05'],daily_sms_limit=1,monthly_sms_limit=2,monthly_budget_cop=78;");
 clock=Date.now();
 const env={NOVA_SMS_ENABLED:String(envFlag),INALAMBRIA_SMS_API_KEY:keyValid?'sk_test_synthetic_never_real':'',SUPABASE_SERVICE_KEY:'synthetic-local-key',TOKEN_HASH_SECRET:'synthetic-local-hmac-secret',REGISTRATION_SIGNING_SECRET:'synthetic-local-session-secret',TURNSTILE_SECRET_KEY:'synthetic-local-captcha-secret',PHONE_NUMBER_ID:'123456789012345',WHATSAPP_TOKEN:'synthetic-local-whatsapp-token'};
 const asService=async fn=>{await db.exec('set role service_role');try{return await fn();}finally{await db.exec('reset role');}};
 const callRpc=async(name,args)=>{assert.ok(order[name],name);return asService(async()=>(await db.query('select public.'+name+'('+order[name].map((_,i)=>'$'+(i+1)).join(',')+') value',order[name].map(k=>args[k]??null))).rows[0].value);};
 const filter=u=>{const fields=new Set(['id','cedula','celular','enlace_registro_id','verificado','registro_consumido_at','envio_aceptado_at','envio_fallido_at','expira_at','intentos','codigo_hash']),terms=[],values=[];
  for(const [field,value] of u.searchParams){if(['select','order','limit'].includes(field))continue;assert.ok(fields.has(field),'closed metadata filter '+field);if(value==='is.null')terms.push(field+' is null');else if(value==='not.is.null')terms.push(field+' is not null');else{const m=/^(eq|gt|lt)\.(.*)$/.exec(value);assert.ok(m,value);values.push(m[2]);terms.push(field+({eq:'=',gt:'>',lt:'<'})[m[1]]+'$'+values.length);}}return {where:terms.join(' and ')||'true',values};};
 const fetcher=async(raw,opts={})=>{
  const u=new URL(String(raw));
  if(u.origin==='https://api.inalambria.express'&&u.pathname==='/v1/messages/send'){
   counts.provider++;assert.equal(opts.method,'POST');assert.equal(opts.redirect,'manual');assert.equal(opts.headers.authorization,'Bearer '+env.INALAMBRIA_SMS_API_KEY);const body=JSON.parse(opts.body);assert.deepEqual(body.recipients,['+573000000000']);assert.equal(body.async,false);assert.ok(body.content.length<=160);assert.equal(body.content.includes('5 minutos'),true);
   const wait=opts.signal?.timeoutMs;assert.ok([8000,30000].includes(wait),'provider-specific timeout is observable');clock+=Math.min(delayMs,wait);if(pauseDuringProvider)await db.exec('update public.nova_client_otp_policy set enabled=false');
   if(delayMs>wait){const e=Error('Synthetic provider timeout');e.name='TimeoutError';throw e;}
   return Response.json(providerBody??(status===200?{ok:true,consumptionId:ids.consumption,messages:1,credits:1,amount:39,currency:'COP'}:{error:'synthetic-blocked'}),{status});
  }
  if(u.hostname==='graph.facebook.com'){counts.meta++;throw Error('No WhatsApp fallback permitted');}
  if(u.origin!=='https://mock-kora.invalid'){counts.unexpected++;throw Error('MOCK_EXTERNAL_DESTINATION_FORBIDDEN');}
  if(u.pathname.startsWith('/rest/v1/rpc/')){const name=u.pathname.split('/').at(-1);counts.rpc[name]=(counts.rpc[name]||0)+1;const args=JSON.parse(opts.body);
   if(name==='nova_client_otp_finish'&&finishLoss){finishLoss=false;return Response.json({message:'synthetic-write-unconfirmed'},{status:503});}
   try{return Response.json(await callRpc(name,args));}catch(error){return Response.json({message:error.message},{status:400});}
  }
  if(u.pathname==='/rest/v1/otp_codigos'){
   const f=filter(u);return asService(async()=>{
    if((opts.method||'GET')==='GET'){const select=u.searchParams.get('select');assert.equal(select,'id,codigo_hash,intentos');return Response.json((await db.query('select id,codigo_hash,intentos from public.otp_codigos where '+f.where+' order by created_at desc limit 1',f.values)).rows);}
    assert.equal(opts.method,'PATCH');const body=JSON.parse(opts.body),keys=Object.keys(body);assert.equal(keys.length,1);assert.ok(['verificado','intentos'].includes(keys[0]));const params=[...f.values,body[keys[0]]];return Response.json((await db.query('update public.otp_codigos set '+keys[0]+'=$'+params.length+' where '+f.where+' returning id',params)).rows);
   });
  }
  counts.unexpected++;throw Error('MOCK_UNKNOWN_DESTINATION');
 };
 const resolveContext=async(token)=>token===input.enlace_token?{ok:true,enlaceId:ids.link}:{ok:false,response:{status:404,body:{ok:false,error:'Synthetic invalid link'}}};
 const sandbox={TextEncoder,TextDecoder,Uint8Array,WeakMap,URL,Response,Request,crypto:webcrypto,atob,btoa,
  Date:class extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}},
  AbortSignal:{timeout:ms=>{timeouts.push(ms);return {timeoutMs:ms};}},fetch:()=>{counts.unexpected++;throw Error('Implicit network forbidden');},
  SUPABASE_URL22:'https://mock-kora.invalid',SESSION_TTL_MS3:1800000,encoder3:new TextEncoder(),decoder2:new TextDecoder(),BASE64URL_PATTERN2:/^[A-Za-z0-9_-]+$/,HMAC_LENGTH_BYTES2:32,
  resolveContext2:resolveContext};
 vm.createContext(sandbox);const prefix=source.indexOf('// releases/nova-client-sms-20261030/candidate-entry.mjs');assert.ok(prefix>0);vm.runInContext(source.slice(0,prefix),sandbox);
 const helpers=['result4','isRecord4','isCedula2','isCelular2','isCodigo2','isSecureVerifyInput2','isOtpRow2','supabaseHeaders2','otpUrl2','boundOtpFilters2','readOtpRows2','patchOtp2','base64url2','fromBase64url2','importHmacKey2','hmac2','hashOpaqueToken2','verifyOpaqueToken2','isOptionalString2','isSessionPayload2','signSession2','verifySession2','verifySecureOtp2'];
 for(const name of helpers)vm.runInContext(actual(source,name),sandbox);
 const deps={fetcher,supabaseUrl:'https://mock-kora.invalid',headers:()=>({}),resolveContext,now:()=>clock,generateCode:()=>{counts.generated++;return '123456';},hash:(value,key)=>sandbox.hashOpaqueToken2(value,key),verifyTurnstile:async()=>{counts.captcha++;return true;}};
 sandbox.localDeps=deps;sandbox.smsOtpDependencies=()=>deps;
 const tailStart=source.indexOf('const {createClientOtpDelivery,publicDeliveryState,sendTrackedWhatsappOtp}=(()=>{'),tailEnd=source.indexOf('\nconst novaClientOtpDelivery=',tailStart);assert.ok(tailStart>=0&&tailEnd>tailStart);vm.runInContext(source.slice(tailStart,tailEnd),sandbox);
 vm.runInContext('const novaClientOtpDelivery=createClientOtpDelivery({rpc:(name,args,env)=>rpc(name,args,env,localDeps),resolveContext:resolveContext2,fetcher:localDeps.fetcher,now:localDeps.now});',sandbox);
 const guardStart=source.indexOf('async function novaVerifyDeliveryBeforeCode('),guardEnd=source.indexOf('\nasync function novaHandleWhatsappOtpStatus(',guardStart);assert.ok(guardStart>=0&&guardEnd>guardStart);vm.runInContext(source.slice(guardStart,guardEnd),sandbox);
 const ledger=async()=>(await db.query('select d.request_id,d.attempt_id,d.otp_id,d.state,d.reserved_cost_cop,d.reported_cost_cop,d.provider_message_id,d.error_code,o.expira_at,o.envio_aceptado_at,o.envio_fallido_at,o.verificado,o.intentos from public.nova_client_otp_dispatch d join public.otp_codigos o on o.id=d.otp_id order by d.created_at')).rows;
 return {db,env,counts,timeouts,sandbox,deps,callRpc,ledger,send:(extra={})=>sandbox.sendManagedOtp({...input,...extra},null,env,deps),status:()=>sandbox.managedOtpStatus(input,env,deps),options:()=>sandbox.managedOtpOptions(input,env,deps),
  verify:async(code='123456')=>sandbox.verifySecureOtp2({enlace_token:input.enlace_token,cedula:input.cedula,celular:input.celular,codigo:code},env,{fetcher,now:()=>clock}),
  verifySession:token=>sandbox.verifySession2(token,env.REGISTRATION_SIGNING_SECRET,clock),advance:ms=>clock+=ms,close:()=>db.close()};
 }catch(error){await db.close();throw error;}
}

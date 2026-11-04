import {prepareExpressSms,sendPreparedExpressSms} from './inalambria-express.mjs';

// Customer OTP only. No invitations, reference dispatch, registration or photo writes.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECORD=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const CHANNEL=v=>v==='whatsapp'||v==='sms';
const TTL=300000;
const result=(status,body)=>({status,body});
const failure=(status,error,extra={})=>result(status,{ok:false,error,...extra});
// Build isolates both legacy readers from all bound/hashed OTPs before activation.
export const managedOtpEnabled=env=>env.NOVA_SMS_ENABLED==='true';

async function boundedJson(response,max=8192){
  if(Number(response.headers.get('content-length'))>max||!response.body){void response.body?.cancel().catch(()=>{});throw Error('JSON_SIZE');}
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max)throw Error('JSON_SIZE');chunks.push(value);}}
  // Cancelling one branch of Request.clone() can wait for its unread sibling.
  // Do not block rejection on that tee cancellation.
  catch(e){void reader.cancel().catch(()=>{});throw e;}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!RECORD(value))throw Error('JSON_SHAPE');return value;
}
export async function readManagedOtpBody(request){
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))throw Error('JSON_TYPE');
  return boundedJson(request,4096);
}

function validContext(v){return RECORD(v)&&typeof v.enlace_token==='string'&&v.enlace_token.length>=32&&v.enlace_token.length<=1024&&typeof v.cedula==='string'&&/^\d{6,12}$/.test(v.cedula)&&typeof v.celular==='string'&&/^3\d{9}$/.test(v.celular);}
function validLink(v){return RECORD(v)&&typeof v.enlace_token==='string'&&v.enlace_token.length>=32&&v.enlace_token.length<=1024;}
function retryAfter(row,now){const d=Date.parse(row.expiresAt);return Number.isFinite(d)?Math.min(300,Math.max(0,Math.ceil((d-now)/1000))):300;}
function publicState(row,requestId,channel,now){
  if(!RECORD(row)||row.requestId!==requestId||row.channel!==channel||!CHANNEL(row.channel))return pending(requestId,channel);
  const seconds=retryAfter(row,now);
  if(row.state==='expired'||(row.state!=='verified'&&seconds===0))return failure(200,'El código venció.',{state:'expired',request_id:requestId,channel,retry_after:0});
  if(row.state==='accepted'&&UUID.test(row.otpId||''))return result(200,{ok:true,state:'accepted',request_id:requestId,channel,otp_id:row.otpId,retry_after:seconds});
  if(row.state==='failed')return failure(200,'El envío no fue aceptado. Espera a que venza el intento antes de solicitar otro.',{state:'failed',request_id:requestId,channel,retry_after:seconds});
  // A verified challenge never authorizes another send or discloses a session.
  if(row.state==='verified')return failure(409,'Este código ya fue utilizado. Continúa en el formulario original.',{state:'verified',request_id:requestId,channel,retry_after:0});
  return pending(requestId,channel,row.state==='reserved'?'reserved':'uncertain',seconds);
}
function pending(requestId,channel,state='uncertain',retry=300){return result(202,{ok:false,pending:true,state,request_id:requestId,channel,retry_after:retry,error:'Consulta el estado del envío antes de solicitar otro código. Tus datos y fotos se conservan.'});}
function notSent(status,error,requestId,channel){return failure(status,error,{state:'not_sent',request_id:requestId,channel,retry_after:0});}

async function rpc(name,body,env,deps){
  let response;
  try{response=await deps.fetcher(deps.supabaseUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:deps.headers(env),body:JSON.stringify(body),signal:AbortSignal.timeout(8000),redirect:'error'});}
  catch{return {ok:false,uncertain:true};}
  let value;try{value=await boundedJson(response);}catch{return {ok:false,uncertain:true};}
  if(!response.ok){
    const known=['OTP_ACTIVE','OTP_REQUEST_CONFLICT','OTP_LINK_NOT_ACTIVE','SMS_DISABLED','SMS_PILOT_LIMITED','SMS_COST_ANOMALY','SMS_BUDGET_LIMIT','SMS_PHONE_LIMIT','otp_limite_celular','otp_limite_enlace','OTP_INPUT_INVALID','OTP_REASON_REQUIRED'];
    return {ok:false,code:known.find(c=>typeof value.message==='string'&&value.message.includes(c))||null,uncertain:false};
  }
  return {ok:true,value};
}
const contextBody=(input,enlaceId)=>({p_cedula:input.cedula,p_celular:input.celular,p_enlace_registro_id:enlaceId});
async function lookup(input,enlaceId,env,deps){return rpc('nova_client_otp_status',{...contextBody(input,enlaceId),p_request_id:input.request_id},env,deps);}

export async function managedOtpOptions(input,env,deps){
  if(!validLink(input))return failure(400,'Enlace inválido.');
  if(!managedOtpEnabled(env))return result(200,{smsEnabled:false});
  try{prepareExpressSms(env,{phone:'+573000000000',code:'000000'});}catch{return result(200,{smsEnabled:false});}
  const context=await deps.resolveContext(input.enlace_token,env,deps.fetcher);
  if(!context.ok)return context.response;
  const phone=typeof input.celular==='string'&&/^3\d{9}$/.test(input.celular)?input.celular:null;
  const outcome=await rpc('nova_client_otp_options',{p_enlace_registro_id:context.enlaceId,p_celular:phone},env,deps);
  return result(200,{smsEnabled:outcome.ok&&outcome.value.smsEnabled===true});
}

export async function managedOtpStatus(input,env,deps){
  if(!validContext(input)||!UUID.test(input.request_id||''))return failure(400,'Datos inválidos.');
  if(!managedOtpEnabled(env))return failure(503,'La consulta de SMS no está disponible.');
  const context=await deps.resolveContext(input.enlace_token,env,deps.fetcher);
  if(!context.ok)return context.response;
  const outcome=await lookup(input,context.enlaceId,env,deps);
  // Absence is not proof that a timed-out reservation cannot still commit.
  if(!outcome.ok||outcome.value.found!==true)return pending(input.request_id,CHANNEL(input.channel)?input.channel:'sms');
  const row=outcome.value;
  if(row.state==='accepted'){
    // Status deliberately returns no internal attempt/provider/cost fields.
    // SQL supplies otpId only on accepted and only for this exact context.
    if(!UUID.test(row.otpId||''))return pending(input.request_id,row.channel);
  }
  return publicState(row,input.request_id,row.channel,(deps.now??Date.now)());
}

export async function sendManagedOtp(input,remoteIp,env,deps){
  const channel=input?.channel??'whatsapp';
  const requestId=input?.request_id??crypto.randomUUID();
  if(!managedOtpEnabled(env))return notSent(503,'SMS aún no está habilitado.',requestId,channel);
  if(!validContext(input)||!CHANNEL(channel)||!UUID.test(requestId)||typeof input.turnstile_token!=='string'||input.turnstile_token.length<1||input.turnstile_token.length>2048||
      (channel==='sms'?input.sms_reason!=='no_whatsapp':input.sms_reason!==undefined))return notSent(400,'Datos inválidos.',requestId,CHANNEL(channel)?channel:'whatsapp');
  const normalized={...input,request_id:requestId};
  const context=await deps.resolveContext(input.enlace_token,env,deps.fetcher);
  if(!context.ok)return notSent(context.response.status,context.response.body.error,requestId,channel);
  // Recover an existing request before consuming another Turnstile token.
  if(input.request_id){
    const existing=await lookup(normalized,context.enlaceId,env,deps);
    if(!existing.ok)return pending(requestId,channel);
    if(existing.value.found===true){
      if(existing.value.channel!==channel)return failure(409,'El intento pertenece a otro canal.',{reason:'request_conflict'});
      return publicState(existing.value,requestId,channel,(deps.now??Date.now)());
    }
  }
  if(!await deps.verifyTurnstile(input.turnstile_token,remoteIp,env.TURNSTILE_SECRET_KEY,deps.fetcher))return notSent(400,'Verificación anti-robot inválida.',requestId,channel);
  const now=(deps.now??Date.now)(),code=deps.generateCode();
  let prepared;
  try{if(channel==='sms')prepared=prepareExpressSms(env,{phone:'+57'+input.celular,code});
    else if(!/^\d{6,32}$/.test(env.PHONE_NUMBER_ID||'')||typeof env.WHATSAPP_TOKEN!=='string'||!env.WHATSAPP_TOKEN)throw Error('WA_CONFIG');}
  catch{return notSent(503,'El canal solicitado no está disponible.',requestId,channel);}
  let hash;try{hash=await deps.hash('otp:'+code,env.TOKEN_HASH_SECRET);}catch{return notSent(503,'No se pudo preparar el código.',requestId,channel);}
  const reservation=await rpc('nova_client_otp_reserve',{...contextBody(input,context.enlaceId),p_request_id:requestId,p_channel:channel,p_selected_reason:channel==='sms'?'no_whatsapp':null,p_codigo_hash:hash,p_expira_at:new Date(now+TTL).toISOString()},env,deps);
  if(!reservation.ok){
    if(reservation.code==='OTP_ACTIVE')return failure(409,'Ya existe un código vigente. Espera a que venza antes de cambiar de canal.',{reason:'active_challenge',retry_after:300});
    if(reservation.code==='OTP_REQUEST_CONFLICT')return failure(409,'El intento ya pertenece a otra solicitud.',{reason:'request_conflict'});
    if(reservation.code==='OTP_LINK_NOT_ACTIVE')return notSent(404,'Enlace inválido o vencido.',requestId,channel);
    if(reservation.code==='SMS_PILOT_LIMITED')return notSent(403,'SMS está en prueba y este número aún no está habilitado. Puedes solicitar el código por WhatsApp.',requestId,channel);
    if(['SMS_DISABLED','SMS_COST_ANOMALY','SMS_BUDGET_LIMIT','SMS_PHONE_LIMIT','otp_limite_celular','otp_limite_enlace','OTP_INPUT_INVALID','OTP_REASON_REQUIRED'].includes(reservation.code))return notSent(429,'El canal alcanzó su límite o no está disponible. No se envió un código nuevo.',requestId,channel);
    return pending(requestId,channel);
  }
  const row=reservation.value;
  // No send unless SQL unambiguously grants THIS request exactly one dispatch.
  if(row.requestId!==requestId||row.channel!==channel||!UUID.test(row.attemptId||'')||!UUID.test(row.otpId||''))return pending(requestId,channel);
  if(row.canSend!==true)return publicState(row,requestId,channel,now);
  if(row.state!=='reserved')return pending(requestId,channel);
  let delivery;
  const dispatchNow=(deps.now??Date.now)();
  if(!Number.isFinite(Date.parse(row.expiresAt)))return pending(requestId,channel);
  if(Date.parse(row.expiresAt)<=dispatchNow)delivery={status:'failed',reason:'OTP_EXPIRED_BEFORE_SEND'};
  else if(row.reservedCostCop!==(channel==='sms'?39:0))delivery={status:'failed',reason:'OTP_RESERVATION_COST_MISMATCH'};
  else try{delivery=channel==='sms'?await sendPreparedExpressSms(prepared,{fetcher:deps.fetcher}):await sendManagedWhatsapp(input.celular,code,env,deps.fetcher);}
  catch{delivery={status:'uncertain',reason:'PROVIDER_UNCONFIRMED'};}
  const finished=await rpc('nova_client_otp_finish',{p_request_id:requestId,p_attempt_id:row.attemptId,p_status:delivery.status,p_provider_message_id:delivery.providerMessageId??null,p_error_code:delivery.reason??null,p_reported_cost_cop:delivery.reportedCostCOP??null},env,deps);
  // If receipt persistence is uncertain, do not claim accepted or send again.
  if(!finished.ok||finished.value.otpId!==row.otpId)return pending(requestId,channel);
  return publicState(finished.value,requestId,channel,(deps.now??Date.now)());
}

export async function sendManagedWhatsapp(phone,code,env,fetcher=fetch){
  let r;try{r=await fetcher('https://graph.facebook.com/v21.0/'+env.PHONE_NUMBER_ID+'/messages',{method:'POST',headers:{authorization:'Bearer '+env.WHATSAPP_TOKEN,'content-type':'application/json'},redirect:'manual',signal:AbortSignal.timeout(8000),body:JSON.stringify({messaging_product:'whatsapp',to:'57'+phone,type:'template',template:{name:'codigo_verificacion_creditek',language:{code:'es_CO'},components:[{type:'body',parameters:[{type:'text',text:code}]},{type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:code}]}]}})});}catch{return {status:'uncertain',reason:'WA_NETWORK_UNCONFIRMED'};}
  if(r.status>=400&&r.status<500){await r.body?.cancel().catch(()=>{});return {status:'failed',reason:'WA_REJECTED'};}
  if(!r.ok){await r.body?.cancel().catch(()=>{});return {status:'uncertain',reason:'WA_RESPONSE_UNCONFIRMED'};}
  let b;try{b=await boundedJson(r);}catch{return {status:'uncertain',reason:'WA_RESPONSE_INVALID'};}
  const id=b.messages?.length===1&&b.messages[0]?.id;
  if(typeof id!=='string'||!/^wamid\.[A-Za-z0-9._=:/+-]{1,190}$/.test(id))return {status:'uncertain',reason:'WA_ACCEPTANCE_UNCONFIRMED'};
  return {status:'accepted',reason:'WA_ACCEPTED',providerMessageId:id};
}

import {record,uuid,mid,stamp,readDeliveryJson,response} from './common.mjs';
const valid=v=>record(v)&&typeof v.enlace_token==='string'&&v.enlace_token.length>=32&&v.enlace_token.length<=1024&&typeof v.cedula==='string'&&typeof v.celular==='string'&&/^\d{6,12}$/.test(v.cedula)&&/^3\d{9}$/.test(v.celular)&&(v.attempt_id===undefined||uuid(v.attempt_id));
const failedMessage='WhatsApp no pudo entregar este código. Confirma que el celular del cliente sea correcto y tenga WhatsApp. Este código no puede usarse. Tus datos y fotos se conservan.';
const uncertainMessage='No se pudo confirmar la entrega del código. Tus datos y fotos se conservan. No enviamos otro mensaje automáticamente.';
const retry=(row,now)=>Math.min(300,Math.max(0,Math.ceil((Date.parse(row.expiresAt)-now)/1000)));
export function publicDeliveryState(row,now){
 if(!row?.found)return {ok:false,state:'not_found',retry_after:0,error:'No hay un código solicitado para estos datos.'};
 const seconds=retry(row,now);
 const correlation={attempt_id:row.otpId};
 if(row.verified||row.consumed)return {...correlation,ok:false,state:'verified',retry_after:0,error:'Este código ya fue utilizado. Continúa en el formulario original.'};
 if(row.state==='failed')return {...correlation,ok:false,state:'failed',retry_after:seconds,error:failedMessage,...(row.errorCode==='131026'?{error_code:'131026'}:{})};
 if(seconds===0)return {...correlation,ok:false,state:'expired',retry_after:0,error:'El código venció. Puedes solicitar otro después de completar la verificación de seguridad. Tus datos y fotos se conservan.'};
 if(['accepted','sent','delivered','read'].includes(row.state))return {...correlation,ok:true,state:row.state,retry_after:seconds,delivery_confirmed:['delivered','read'].includes(row.state)};
 return {...correlation,ok:false,state:'uncertain',retry_after:seconds,error:uncertainMessage};
}
function validRow(v){return record(v)&&v.found===true&&uuid(v.otpId)&&stamp(v.createdAt)&&stamp(v.expiresAt)&&typeof v.verified==='boolean'&&typeof v.consumed==='boolean'&&typeof v.registered==='boolean'&&['accepted','sent','delivered','read','failed','uncertain'].includes(v.state)&&(!v.registered||mid(v.providerMessageId));}
export function createClientOtpDelivery({rpc,resolveContext,fetcher=(...a)=>fetch(...a),now=Date.now}){
 const args=(input,id)=>({p_cedula:input.cedula,p_celular:input.celular,p_enlace_registro_id:id});
 async function read(input,id,env){
  const r=await rpc('nova_otp_delivery_read',{...args(input,id),p_otp_id:input.attempt_id??null},env);
  if(!r.ok||!record(r.value)||r.value.found!==false&&(!validRow(r.value)||input.attempt_id!==undefined&&r.value.otpId!==input.attempt_id))throw Error('STATUS_UNAVAILABLE');
  let row=r.value;
  if(!row.found||!row.registered||row.state==='failed'||row.verified||row.consumed)return row;
  let signedFailure=null;
  try{
   if(!env.NOVA_REGISTRATION?.fetch||!env.NOVA_REGISTRATION_INTAKE_TOKEN)return row;
   const r=await env.NOVA_REGISTRATION.fetch('https://nova.internal/internal/client-otp-receipt',{method:'POST',headers:{authorization:'Bearer '+env.NOVA_REGISTRATION_INTAKE_TOKEN,'content-type':'application/json'},body:JSON.stringify({providerMessageId:row.providerMessageId,recipient:'57'+input.celular,createdAt:row.createdAt}),signal:AbortSignal.timeout(8000)});
   if(!r.ok){void r.body?.cancel().catch(()=>{});return row;}
   const e=await readDeliveryJson(r,2048);
   if(e.ok!==true||e.found!==true)return row;
   if(e.providerMessageId!==row.providerMessageId||!['sent','delivered','read','failed'].includes(e.state)||!stamp(e.eventAt)||Date.parse(e.eventAt)<Date.parse(row.createdAt)-1000||Date.parse(e.eventAt)>now()+60000||e.errorCode!==null&&!/^\d{1,10}$/.test(e.errorCode))return row;
   if(e.state==='failed')signedFailure={...row,state:'failed',errorCode:e.errorCode};
   const applied=await rpc('nova_otp_delivery_apply',{p_otp_id:row.otpId,p_provider_message_id:row.providerMessageId,p_state:e.state,p_event_at:e.eventAt,p_error_code:e.errorCode},env);
   if(applied.ok&&record(applied.value)&&applied.value.otpId===row.otpId&&applied.value.providerMessageId===row.providerMessageId&&['accepted','sent','delivered','read','failed'].includes(applied.value.state)&&validRow({...row,...applied.value}))row={...row,...applied.value};
   else if(e.state==='failed')return {...row,state:'failed',errorCode:e.errorCode};
  }catch{/* An unavailable delivery report neither authorizes a resend nor implies delivery. */}
  return signedFailure||row;
 }
 async function register(input,id,otpId,providerMessageId,env){
  if(!uuid(otpId)||!mid(providerMessageId))return false;
  const r=await rpc('nova_otp_delivery_register',{...args(input,id),p_otp_id:otpId,p_provider_message_id:providerMessageId},env);
  return r.ok&&validRow(r.value)&&r.value.otpId===otpId&&r.value.providerMessageId===providerMessageId&&r.value.registered===true;
 }
 async function handle(request,env){
  if(request.method!=='POST')return response({ok:false},405);
  try{
   const b=await readDeliveryJson(request,4096);if(!valid(b))return response({ok:false,error:'Datos inválidos.'},400);
   const c=await resolveContext(b.enlace_token,env,fetcher);if(!c.ok)return response(c.response.body,c.response.status);
   if(!env.NOVA_QUALITY_LIMIT?.limit)return response({ok:false,state:'uncertain',error:uncertainMessage},503);
   // Rate key is a one-way hash; never store client identity in a limiter key.
   const material=new TextEncoder().encode('otp-receipt:'+c.enlaceId+':'+b.cedula+':'+b.celular);
   const digest=await crypto.subtle.digest('SHA-256',material),key=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
   const allowed=await env.NOVA_QUALITY_LIMIT.limit({key:'otp-delivery:'+key});
   if(!allowed.success)return response({ok:false,state:'uncertain',retry_after:8,error:'Espera unos segundos para consultar otra vez. No se envió otro código.'},429);
   return response(publicDeliveryState(await read(b,c.enlaceId,env),now()));
  }catch{return response({ok:false,state:'uncertain',retry_after:8,error:uncertainMessage},503);}
 }
 return {read,register,handle};
}

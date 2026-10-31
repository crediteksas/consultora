import {mid,readDeliveryJson} from './common.mjs';
// A successful HTTP response is acceptance only, never delivery.
export async function sendTrackedWhatsappOtp(phone,code,env,fetcher=(...a)=>fetch(...a)){
 if(!/^3\d{9}$/.test(phone)||!/^\d{6}$/.test(code)||!/^\d{6,32}$/.test(env.PHONE_NUMBER_ID||'')||!env.WHATSAPP_TOKEN)return {state:'not_sent'};
 try{
  const r=await fetcher('https://graph.facebook.com/v21.0/'+env.PHONE_NUMBER_ID+'/messages',{method:'POST',headers:{authorization:'Bearer '+env.WHATSAPP_TOKEN,'content-type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:'57'+phone,type:'template',template:{name:'codigo_verificacion_creditek',language:{code:'es_CO'},components:[{type:'body',parameters:[{type:'text',text:code}]},{type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:code}]}]}}),redirect:'manual',signal:AbortSignal.timeout(8000)});
  if(r.status>=300&&r.status<400){void r.body?.cancel().catch(()=>{});return {state:'uncertain'};}
  const b=await readDeliveryJson(r,8192);
  if(!r.ok)return {state:r.status>=400&&r.status<500?'failed':'uncertain'};
  const id=Array.isArray(b?.messages)&&b.messages.length===1&&!b.error?b.messages[0]?.id:null;return mid(id)?{state:'accepted',providerMessageId:id}:{state:'uncertain'};
 }catch{return {state:'uncertain'};}
}

import {record,mid,stamp,readDeliveryJson,response} from './common.mjs';
const BASE='https://ditiwpndvmyuqcagupea.supabase.co';
const RANK={sent:1,delivered:2,read:3};
// Only the authenticated CLIENTES service supplies the bound Meta ID and phone.
// The source rows were authenticated by Sofia's existing signed webhook receiver.
export function createNovaOtpReceiptBridge({equal,fetcher=(...a)=>fetch(...a),now=Date.now}){
 return async function novaOtpReceipt(request,env){
  if(request.method!=='POST')return response({ok:false},405);
  const token=request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/)?.[1];
  if(typeof token!=='string'||!env.NOVA_REGISTRATION_INTAKE_TOKEN||!await equal(token,env.NOVA_REGISTRATION_INTAKE_TOKEN))return response({ok:false},401);
  try{
   const b=await readDeliveryJson(request,2048),clock=now();
   if(!record(b)||!mid(b.providerMessageId)||!/^573\d{9}$/.test(b.recipient)||!stamp(b.createdAt)||Date.parse(b.createdAt)>clock+1000||Date.parse(b.createdAt)<clock-86400000)return response({ok:false},400);
   const key=env.SUPABASE_SERVICE_ROLE_KEY;
   if(env.SUPABASE_URL?.replace(/\/$/,'')!==BASE||typeof key!=='string'||!key)return response({ok:false},503);
   const url=new URL(BASE+'/rest/v1/sofia_delivery_events');
   for(const [k,v]of Object.entries({message_id:'eq.'+b.providerMessageId,recipient:'eq.'+b.recipient,evidence_source:'eq.signed_webhook',event_at:'gte.'+new Date(Date.parse(b.createdAt)-1000).toISOString(),and:'(event_at.lte.'+new Date(clock+60000).toISOString()+')',select:'message_id,recipient,status,event_at,error_code,evidence_source',order:'event_at.asc',limit:'65'}))url.searchParams.set(k,v);
   const r=await fetcher(url,{headers:{apikey:key,...(!key.startsWith('sb_secret_')?{authorization:'Bearer '+key}:{})},redirect:'manual',signal:AbortSignal.timeout(8000)});
   if(!r.ok||r.status>=300&&r.status<400){void r.body?.cancel().catch(()=>{});throw Error('RECEIPTS_UNAVAILABLE');}
   const rows=await readDeliveryJson(r);
   if(!Array.isArray(rows)||rows.length>64)throw Error('RECEIPTS_SHAPE');
   let best=null;
   for(const e of rows){
    if(!record(e)||e.message_id!==b.providerMessageId||e.recipient!==b.recipient||e.evidence_source!=='signed_webhook'||!['sent','delivered','read','failed'].includes(e.status)||!stamp(e.event_at)||Date.parse(e.event_at)<Date.parse(b.createdAt)-1000||Date.parse(e.event_at)>clock+60000||e.error_code!==null&&(!/^\d{1,10}$/.test(String(e.error_code))))throw Error('RECEIPT_BINDING');
    if(!best||e.status==='failed'&&best.status!=='failed'||e.status===best.status&&Date.parse(e.event_at)>Date.parse(best.event_at)||best.status!=='failed'&&(RANK[e.status]||0)>(RANK[best.status]||0))best=e;
   }
   return response(best?{ok:true,found:true,providerMessageId:b.providerMessageId,state:best.status,eventAt:new Date(best.event_at).toISOString(),errorCode:best.error_code===null?null:String(best.error_code)}:{ok:true,found:false});
  }catch{return response({ok:false,error:'RECEIPT_UNAVAILABLE'},503);}
 };
}

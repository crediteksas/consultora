// Server/native-only preparation. No route, credentials, sends or job claiming.
// A real browser driver must supply verifyCapture; it is denied by default.
import{createHash}from'node:crypto';
import{isDeepStrictEqual}from'node:util';
import{prepareVisibleStatement,channel}from'./statement-preparation.mjs';
import{unavailableReplyReason}from'./observed-protocol.mjs';
import{enrichWithPaymentHistory}from'./payment-history.mjs';
import{validPlatformConsent}from'../krediya/automatizacion/platform-consent.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const safeJob=(j,id,lease,now)=>j?.id===id&&j.lease_id===lease&&j.platform==='KREDIYA'&&j.status==='running'&&UUID.test(j.application_id)&&UUID.test(j.source_application_id)&&/^[a-f0-9]{64}$/.test(j.payload_hash)&&/^\d{6,12}$/.test(j.inputs?.document)&&/^3\d{9}$/.test(j.inputs?.phone)&&validPlatformConsent(j.consent,now)&&Number.isFinite(Date.parse(j.lease_until))&&Date.parse(j.lease_until)>now+5000;
const identity=j=>JSON.stringify([j.id,j.lease_id,j.application_id,j.source_application_id,j.payload_hash,j.inputs.document,j.inputs.phone]);
export function createCompletionAdapter({enabled=false,workLine=null,readJob,verifySource,verifyCapture=async()=>false,finishJob,now=Date.now}={}){
 let busy=false,paused=false;
 const blocked=reason=>({saved:false,reason});
 return {async complete({id,leaseId,capture}={}){
  if(!enabled)return blocked('NOT_ACTIVATED');
  if(paused)return blocked('REVIEW_REQUIRED');
  if(busy)return blocked('CHANNEL_BUSY');
  if(!/^573\d{9}$/.test(workLine||''))return blocked('WORK_LINE_REQUIRED');
  if(!UUID.test(id||'')||!UUID.test(leaseId||''))return blocked('INVALID_JOB');
  if(capture?.accountPhone!==workLine||capture?.senderPhone!==channel.providerPhone)return blocked('WRONG_CHANNEL');
  if(typeof capture.messageId!=='string'||!/^[-A-Za-z0-9._=]{1,200}$/.test(capture.messageId))return blocked('MESSAGE_ID_REQUIRED');
  busy=true;
  try{
   const job=await readJob(id);
   if(!safeJob(job,id,leaseId,now())||!await verifySource(job))return blocked('AUTHORIZATION_NOT_CURRENT');
   const at=Date.parse(capture.receivedAt),created=Date.parse(job.created_at);
   if(!Number.isFinite(at)||!Number.isFinite(created)||at<created||at>now())return blocked('STALE_CAPTURE');
   if(!await verifyCapture(job,capture))return blocked('CASE_ASSOCIATION_NOT_PROVEN');
   const prepared=prepareVisibleStatement(capture,now());
   const normalized=typeof capture.text==='string'?capture.text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase():'';
   const noMatchLine='no hemos encontrado una coincidencia con la cedula '+job.inputs.document;
   const noMatch=capture.resultKind==='no_match'&&(normalized===noMatchLine||normalized===noMatchLine+'.');
   const unavailableReason=capture.resultKind==='unavailable'?unavailableReplyReason(capture.text):null;
   if(!noMatch&&!unavailableReason&&prepared.readiness!=='requires_case_binding')return blocked(prepared.reason);
   const current=await readJob(id);
   if(!safeJob(current,id,leaseId,now())||identity(current)!==identity(job)||!await verifySource(current))return blocked('AUTHORIZATION_NOT_CURRENT');
   let observation=unavailableReason?{platform:'KREDIYA',availability:'unavailable',reason:unavailableReason,remainingBalance:null,creditDecision:null}:noMatch?{platform:'KREDIYA',availability:'no_match',remainingBalance:null,creditDecision:null}:{platform:'KREDIYA',availability:'observed',...prepared.observation,identityStatus:'provider_match_requires_case_verification',creditDecision:null};
   if(capture.paymentHistory){
    if(noMatch||unavailableReason||capture.paymentHistory.queriedDocumentHash!==createHash('sha256').update(job.inputs.document).digest('hex'))
      return blocked('HISTORY_IDENTITY_MISMATCH');
    observation=enrichWithPaymentHistory(observation,capture.paymentHistory);
   }
   let receipt;
   try{receipt=await finishJob({p_id:id,p_lease_id:leaseId,p_observation:observation});}
   catch{paused=true;return {saved:false,uncertain:true,reason:'PERSISTENCE_UNCERTAIN'};}
   if(receipt?.saved!==true)return blocked('NOT_SAVED');
   // Re-read the committed row: a receipt alone does not prove its final contents.
   let saved;
   try{saved=await readJob(id);}catch{paused=true;return {saved:true,confirmed:false,reason:'PERSISTENCE_CONFIRMATION_REQUIRED'};}
   const same=saved?.id===id&&saved.platform==='KREDIYA'&&saved.application_id===current.application_id&&saved.payload_hash===current.payload_hash&&saved.completion_lease_id===leaseId;
   const actual=saved?.observation;
   const observed=same&&saved.status==='observed'&&['observed','no_match'].includes(actual?.availability)&&Object.keys(observation).every(k=>isDeepStrictEqual(actual[k],observation[k]));
   const unavailable=same&&saved.status==='unavailable'&&actual?.platform==='KREDIYA'&&actual.availability==='unavailable'&&actual.creditDecision===null&&/^[A-Z0-9_]{1,80}$/.test(actual.reason||'');
   if(!observed&&!unavailable){paused=true;return {saved:true,confirmed:false,reason:'PERSISTENCE_CONFIRMATION_REQUIRED'};}
   return {saved:true,confirmed:true,availability:actual.availability,...unavailable?{reason:actual.reason}:{},creditDecision:null};
  }catch{paused=true;return blocked('CONNECTOR_ERROR');}
  finally{busy=false;}
 },status(){return {busy,paused,enabled,workLineConfigured:/^573\d{9}$/.test(workLine||'')};}};
}

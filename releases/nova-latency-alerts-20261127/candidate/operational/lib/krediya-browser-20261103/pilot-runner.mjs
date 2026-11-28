// One-case pilot coordinator. No browser or cloud credentials in this module.
// Transport must confirm account, peer, exact outgoing text and visible message IDs.
import{createHash}from'node:crypto';
import{prepareVisibleStatement}from'./statement-preparation.mjs';
import{makeHistoryEvidence}from'./payment-history.mjs';
import{createCompletionAdapter}from'./completion-adapter.mjs';
import{validPlatformConsent}from'../krediya/automatizacion/platform-consent.mjs';
import{channel}from'./statement-preparation.mjs';
import{classifyReply,unavailableReplyReason}from'./observed-protocol.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const msg=/^[-A-Za-z0-9._=]{1,200}$/;
const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[*_]/g,'').trim().toLowerCase();
export function serviceHours(now){const d=new Date(now-5*3600000);return d.getUTCHours()>=8&&d.getUTCHours()<20;}
export function createPilotRunner({enabled=false,workLine,jobId,leaseId,baselineMessageIds=[],readJob,verifySource,verifyView,sendText,resolveName=async()=>null,finishJob,record,requestMenu=async()=>null,now=Date.now,hours=serviceHours,deadline=Infinity}={}){
 let stage='idle',busy=false,paused=false,started=0,lastSent=0,sourceKey=null,job=null,lastReason=null,terminal=false,nameSent=false,providerResets=0;
 let statementEvent=null,documentMessageId=null,historyEvents=[];
 const seen=new Set(baselineMessageIds),digests=new Map(),proofs=new WeakSet();
 const sourceIdentity=j=>JSON.stringify([j.id,j.lease_id,j.application_id,j.source_application_id,j.payload_hash,j.inputs?.document,j.inputs?.phone]);
 const status=()=>({stage,busy,paused,terminal,lastReason});
 function stop(reason){paused=true;stage='paused';lastReason=reason;return {ok:false,reason};}
 async function journal(phase,kind){await record({phase,kind,stage,at:new Date(now()).toISOString()});}
 async function current(){
  const j=await readJob(jobId),t=now();
  if(!j||j.id!==jobId||j.lease_id!==leaseId||j.platform!=='KREDIYA'||j.status!=='running'||!uuid.test(j.application_id)||!uuid.test(j.source_application_id)||!/^[a-f0-9]{64}$/.test(j.payload_hash)||!/^\d{6,12}$/.test(j.inputs?.document)||!/^3\d{9}$/.test(j.inputs?.phone)||!validPlatformConsent(j.consent,t)||!Number.isFinite(Date.parse(j.lease_until))||Date.parse(j.lease_until)<=t+10000||!await verifySource(j))return null;
  if(sourceKey&&sourceKey!==sourceIdentity(j))return null;return j;
 }
 const completion=createCompletionAdapter({enabled,workLine,readJob,verifySource,verifyCapture:async(j,c)=>proofs.has(c)&&j.id===jobId&&j.lease_id===leaseId,finishJob,now});
 async function send(kind,text,nextStage){
  if(now()>=deadline)return stop('SESSION_EXPIRED');
  if(!hours(now()))return stop('OUTSIDE_SERVICE_HOURS');
  if(!await verifyView({workLine,providerPhone:channel.providerPhone}))return stop('WRONG_VIEW');
  const j=await current();if(!j)return stop('AUTHORIZATION_NOT_CURRENT');
  await journal('send_intent',kind); // failure here must prevent sending.
  if(now()>=deadline)return stop('SESSION_EXPIRED');
  const ack=kind==='history_menu'?await requestMenu():await sendText(text);
  if(ack?.confirmed!==true||!msg.test(ack.messageId||'')||seen.has(ack.messageId)||ack.text!==text||ack.accountPhone!==workLine||ack.providerPhone!==channel.providerPhone)return stop('SEND_NOT_CONFIRMED');
  seen.add(ack.messageId);if(kind==='authorized_document')documentMessageId=ack.messageId;lastSent=now();stage=nextStage;await journal('send_confirmed',kind);return {ok:true,waiting:true};
 }
 async function saveCapture(e,resultKind,historyEvent=null){
  if(!await verifyView({workLine,providerPhone:channel.providerPhone}))return stop('WRONG_VIEW');
  const history=historyEvent?makeHistoryEvidence({text:historyEvent.text,messageId:historyEvent.messageId,receivedAt:historyEvent.receivedAt,document:job.inputs.document,documentMessageId,statementMessageId:e.messageId,contractId:prepareVisibleStatement(e,now()).observation.providerContractId},now()):null;
  const capture={...history?{paymentHistory:history}:{},accountPhone:workLine,senderPhone:e.senderPhone,messageId:e.messageId,text:e.text,receivedAt:e.receivedAt,...resultKind?{resultKind}:{}};proofs.add(capture);
  await journal('save_intent','statement');const receipt=await completion.complete({id:jobId,leaseId,capture});
  if(!receipt.saved||receipt.confirmed!==true)return stop(receipt.reason||'NOT_SAVED');
  terminal=true;stage='completed';await journal('save_confirmed','statement');return {ok:true,saved:true,confirmed:true,availability:receipt.availability,commercialMenu:classifyReply(e.text)==='commercial_menu',creditDecision:null};
 }
 async function run(action){if(busy)return {ok:false,reason:'CHANNEL_BUSY'};busy=true;try{return await action();}catch(error){const reason=/^BROWSER_(SNAPSHOT|COMPOSE|COMPOSE_CONFIRM|SEND_CLICK|SEND_CONFIRM|READ_INCOMING)_FAILED$/.test(error?.message||'')?error.message:'OPERATION_UNCERTAIN';try{await journal('stopped','operation_error');}catch{}return stop(reason);}finally{busy=false;}}
 return {status,checkDeadline(){if(!terminal&&!paused&&stage!=='idle'&&now()-Math.max(started,lastSent)>=210000)stop('SESSION_EXPIRED');return {ok:!paused,...status()};},
 async begin(){return run(async()=>{
  if(!enabled)return {ok:false,reason:'NOT_ACTIVATED'};
  if(stage!=='idle'||paused||terminal)return {ok:false,reason:'PILOT_ALREADY_STARTED'};
  if(!/^573\d{9}$/.test(workLine||'')||workLine===channel.providerPhone||!uuid.test(jobId||'')||!uuid.test(leaseId||'')||!Array.isArray(baselineMessageIds)||baselineMessageIds.length>100||baselineMessageIds.some(id=>!msg.test(id))||new Set(baselineMessageIds).size!==baselineMessageIds.length||typeof record!=='function')return stop('INVALID_SETUP');
  job=await current();if(!job)return stop('AUTHORIZATION_NOT_CURRENT');sourceKey=sourceIdentity(job);started=now();return send('greeting','Hola KrediYa','await_prompt');
 });},
 async resumeGreeting(ack){return run(async()=>{
  if(!enabled||stage!=='idle'||paused||terminal||!uuid.test(jobId||'')||!uuid.test(leaseId||''))return stop('INVALID_RECOVERY');
  job=await current();if(!job)return stop('AUTHORIZATION_NOT_CURRENT');
  if(ack?.confirmed!==true||ack.text!=='Hola KrediYa'||!msg.test(ack.messageId||'')||seen.has(ack.messageId)||ack.accountPhone!==workLine||ack.providerPhone!==channel.providerPhone)return stop('GREETING_PROOF_REQUIRED');
  sourceKey=sourceIdentity(job);seen.add(ack.messageId);started=now();lastSent=now();stage='await_prompt';await journal('reservation_received','job');return{ok:true,waiting:true};
 });},
 async resumeDocument(ack){return run(async()=>{
  if(!enabled||stage!=='idle'||paused||terminal||!uuid.test(jobId||'')||!uuid.test(leaseId||''))return stop('INVALID_RECOVERY');
  job=await current();if(!job)return stop('AUTHORIZATION_NOT_CURRENT');
  if(ack?.confirmed!==true||ack.text!==job.inputs.document||!msg.test(ack.messageId||'')||seen.has(ack.messageId)||ack.accountPhone!==workLine||ack.providerPhone!==channel.providerPhone)return stop('DOCUMENT_PROOF_REQUIRED');
  sourceKey=sourceIdentity(job);seen.add(ack.messageId);documentMessageId=ack.messageId;started=now();lastSent=now();stage='await_menu';await journal('reservation_received','job');return{ok:true,waiting:true};
 });},
 async resumeHistory(recovery){return run(async()=>{
  if(!enabled||stage!=='idle'||paused||terminal)return stop('INVALID_RECOVERY');
  job=await current();if(!job)return stop('AUTHORIZATION_NOT_CURRENT');
  const ack=recovery?.ack,e=recovery?.statement;
  if(ack?.confirmed!==true||ack.text!=='SI'||!msg.test(ack.messageId||'')||seen.has(ack.messageId)||ack.accountPhone!==workLine||ack.providerPhone!==channel.providerPhone||!msg.test(recovery.documentMessageId||'')||!msg.test(e?.messageId||'')||e.senderPhone!==channel.providerPhone||prepareVisibleStatement(e,now()).readiness!=='requires_case_binding')return stop('HISTORY_RECOVERY_PROOF_REQUIRED');
  sourceKey=sourceIdentity(job);seen.add(ack.messageId);documentMessageId=recovery.documentMessageId;statementEvent=e;started=now();lastSent=now();stage='await_history_menu';await journal('reservation_received','job');if(recovery.historyEvent)return saveCapture(statementEvent,null,recovery.historyEvent);return{ok:true,waiting:true};
 });},
 async receive(e){return run(async()=>{
  if(paused||terminal||stage==='idle')return {ok:false,reason:'PILOT_NOT_WAITING'};
  if(now()>=deadline||now()-Math.max(started,lastSent)>=210000||!await current())return stop('AUTHORIZATION_OR_SESSION_EXPIRED');
  if(now()>=deadline)return stop('SESSION_EXPIRED');
  if(!e||!msg.test(e.messageId||'')||e.direction!=='incoming'||e.accountPhone!==workLine||e.senderPhone!==channel.providerPhone||typeof e.text!=='string'||e.text.length>8192)return stop('UNVERIFIED_MESSAGE');
  const digest=createHash('sha256').update(e.text).digest('hex');
  if(seen.has(e.messageId)){if(digests.has(e.messageId)&&digests.get(e.messageId)!==digest)return stop('CHANGED_REPLAY');return {ok:true,duplicate:true};}
  const at=Date.parse(e.receivedAt);if(!Number.isFinite(at)||at<lastSent||at>now())return stop('STALE_MESSAGE');
  if(seen.size>=150)return stop('MESSAGE_LIMIT');seen.add(e.messageId);digests.set(e.messageId,digest);
  const text=normalize(e.text);
  if(/\b(otp|contrasena|codigo de verificaci[oó]n|codigo de seguridad)\b/.test(text))return stop('HUMAN_VERIFICATION_REQUIRED');
  if(stage==='await_prompt'){
   if(classifyReply(e.text)==='document_prompt')return send('authorized_document',job.inputs.document,'await_menu');
   if(/^¡?hola! soy yabot, tu asistente virtual de kredi(?:ya| ya) en colombia/.test(text)||text.startsWith('quiero contarte que nuestro horario de atencion personalizada'))return {ok:true,waiting:true};
   return stop('UNRECOGNIZED_PROMPT');
  }
  if(stage==='await_menu'){
   if(/^¡?hola! soy yabot, tu asistente virtual de kredi(?:ya| ya) en colombia/.test(text)){
    if(providerResets>=1)return stop('REPEATED_PROVIDER_SESSION_RESET');
    providerResets++;nameSent=false;stage='await_prompt';await journal('reservation_received','job');return{ok:true,waiting:true};
   }

   const noMatch='no hemos encontrado una coincidencia con la cedula '+job.inputs.document;
   if(text===noMatch||text===noMatch+'.')return saveCapture(e,'no_match');
   if(classifyReply(e.text)==='name_prompt'&&!nameSent){
    const name=await resolveName();
    if(typeof name!=='string'||name.length>120||!/^\p{L}[\p{L} .’'\-]*\p{L}$/u.test(name)||name.trim().split(/\s+/).length<2)return stop('AUTHORIZED_NAME_UNAVAILABLE');
    nameSent=true;return send('authorized_name',name,'await_menu');
   }
   if(classifyReply(e.text)==='name_prompt')return stop('REPEATED_NAME_PROMPT');
   if(classifyReply(e.text)==='menu_intro')return {ok:true,waiting:true};
   if(unavailableReplyReason(e.text))return saveCapture(e,'unavailable');
   if(classifyReply(e.text)==='account_menu')return send('statement_option','1','await_statement');
   return stop('UNRECOGNIZED_MENU');
  }
  if(stage==='await_statement'){
   if(text==='adjunto informacion del estado de cuenta')return {ok:true,waiting:true};
   const prepared=prepareVisibleStatement(e,now());
   if(prepared.readiness!=='requires_case_binding')return stop(prepared.reason||'INVALID_STATEMENT');
   statementEvent=e;stage='await_history_prompt';
   await journal('statement_received','statement');return{ok:true,waiting:true};
  }
  if(stage==='await_history_prompt'){
   if(/^te puedo ayudar en algo mas\b/.test(text))return send('history_menu','SI','await_history_menu');
   return stop('UNRECOGNIZED_HISTORY_PROMPT');
  }
  if(stage==='await_history_menu'){
   if(classifyReply(e.text)==='menu_intro')return{ok:true,waiting:true};
   if(classifyReply(e.text)==='account_menu'&&/visualizar el historial de pagos/.test(text))
     return send('history_option','4','await_history');
   return stop('UNRECOGNIZED_HISTORY_MENU');
  }
  if(stage==='await_history'){
   if(/^queremos asegurarnos de que todo este claro/.test(text)||/^te puedo ayudar en algo mas\b/.test(text)){
    if(!historyEvents.length)return stop('HISTORY_NOT_RETURNED');
    const combined={...historyEvents[0],text:historyEvents.map(item=>item.text).join('\n'),receivedAt:e.receivedAt};
    return saveCapture(statementEvent,null,combined);
   }
   if(historyEvents.length>=16||historyEvents.reduce((n,item)=>n+item.text.length,0)+e.text.length>8192)return stop('HISTORY_TOO_LARGE');
   historyEvents.push(e);return{ok:true,waiting:true};
  }
  return stop('UNRECOGNIZED_STAGE');
 });}
 };
}

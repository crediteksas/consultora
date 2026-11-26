import{createPilotRunner,serviceHours}from'../lib/krediya-browser-20261103/pilot-runner.mjs';
import{openPilotJournal}from'../lib/krediya-browser-20261103/pilot-journal.mjs';
const closing=text=>/^¡gracias por contactarnos! (?:😊 )?ha sido un placer atenderte y estamos aqui para ti\. ¡que tengas un excelente dia!$/.test(text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase());
export function createOperationalEngine({client,browser,record,previous={},journalDirectory,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),openJournal=openPilotJournal,resumeJournal=async()=>{throw Error('RECOVERY_NOT_CONFIGURED');},recoverJournal=async()=>{}}){
 let freshGreetingRequired=previous.freshGreetingRequired===true,reviewReason=previous.reason;
 let recoveryStep='start';
 let busy=false,paused=!!(previous.phase&&previous.phase!=='idle'),context=previous.context||null,reservationPending=previous.reservationPending===true;
 const state=()=>({busy,paused,context:context?{id:context.id,lease:context.lease}:null,automaticRecoveryAllowed:!busy&&!context&&!reservationPending});
 async function persist(phase,extra={}){await record({phase,reservationPending,freshGreetingRequired,context:context?{id:context.id,lease:context.lease}:null,at:new Date(now()).toISOString(),...extra});}
 async function fail(reason){paused=true;reviewReason=reason;await persist('review',{reason});return{state:'review',reason};}
 async function recoverExpiredGreeting(){
  if(!context||reservationPending||!['SESSION_EXPIRED','EXPIRED_GREETING_RELEASED'].includes(reviewReason))return false;
  if(reviewReason==='EXPIRED_GREETING_RELEASED'){
   await recoverJournal(true);
   context=null;
   paused=false;
   await persist('idle');
   return true;
  }
  recoveryStep='journal';
  const journal=await resumeJournal();
  try{
   if(journal.recoveryStage!=='greeting')return false;
   recoveryStep='release';
   const result=await client.recoverExpired(context);
   if(!result.released)return false;
   freshGreetingRequired=true;
   reviewReason='EXPIRED_GREETING_RELEASED';
   await persist('review',{reason:reviewReason});
   await journal.close({confirmedComplete:true});
   context=null;
   paused=false;
   await persist('idle');
   return true;
  }finally{await journal.close();}
 }
 async function continueConversation(runner,result,journal){ const end=now()+225000;while(!runner.status().terminal&&!runner.status().paused&&now()<end){await sleep(1500);const events=await browser('readIncoming');if(!Array.isArray(events)||events.length>24)throw Error('INVALID_EVENTS');runner.checkDeadline();for(const e of events){result=await runner.receive(e);if(runner.status().terminal||runner.status().paused)break;}}
 if(!runner.status().terminal||result.confirmed!==true)return fail(runner.status().lastReason||'RESULT_NOT_CONFIRMED');await persist('saved');
 let informationSent=false;
 if(result.commercialMenu===true){
  await journal.record({phase:'send_intent',kind:'closing',stage:'await_closure',at:new Date(now()).toISOString()});
  if(!await browser('verifyView'))return fail('WRONG_VIEW');
  const ack=await browser('sendText','1');
  if(ack?.confirmed!==true||ack.text!=='1'||!/^[-A-Za-z0-9._=]{1,200}$/.test(ack.messageId||'')||ack.accountPhone!=='573118657153'||ack.providerPhone!=='573155000105')return fail('CLOSURE_SEND_NOT_CONFIRMED');
  await journal.record({phase:'send_confirmed',kind:'closing',stage:'await_close_reply',at:new Date(now()).toISOString()});informationSent=true;
 }
 const closeEnd=now()+30000;let sent=informationSent,closed=false;while(now()<closeEnd&&!closed){if(!sent){await journal.record({phase:'send_intent',kind:'closing',stage:'await_closure',at:new Date(now()).toISOString()});sent=(await browser('requestClose'))?.sent===true;}else{const events=await browser('readIncoming');for(const e of events){if(e.senderPhone!=='573155000105'||e.accountPhone!=='573118657153'||e.direction!=='incoming')throw Error('UNVERIFIED_CLOSE');if(closing(e.text))closed=true;else if(!informationSent)throw Error('UNEXPECTED_CLOSE_REPLY');}}if(!closed)await sleep(1500);}
 if(!closed)return fail('CLOSURE_NOT_CONFIRMED');if(!(await client.release(context)).released)return fail('CHANNEL_NOT_RELEASED');await journal.close({confirmedComplete:true});context=null;await persist('idle');return{state:'saved',saved:true,confirmed:true,availability:result.availability};
 }
 return{state,
 async status(){const health=await client.status(),local=state();if(health.operationalEnabled&&!busy&&paused&&context&&!reservationPending&&['SESSION_EXPIRED','EXPIRED_GREETING_RELEASED'].includes(reviewReason))local.automaticRecoveryAllowed=true;if(!busy&&paused&&context&&!reservationPending){try{const job=await client.read(context);if(job?.completion_lease_id===context.lease&&['observed','unavailable'].includes(job.status))local.automaticRecoveryAllowed=true;if(['BROWSER_COMPOSE_FAILED','BROWSER_READ_INCOMING_FAILED'].includes(reviewReason)&&job?.status==='running'&&job.lease_id===context.lease&&Date.parse(job.lease_until)>now()+10000&&await client.check(context))local.automaticRecoveryAllowed=true;}catch{}}return{...health,...local};},
 async resume(){if(busy)return{state:'busy'};if(context&&['SESSION_EXPIRED','EXPIRED_GREETING_RELEASED'].includes(reviewReason)){busy=true;try{if(await recoverExpiredGreeting())return{state:'ready'};}catch{}finally{busy=false;}await persist('review',{reason:reviewReason,recoveryStep});return{state:'review',reason:reviewReason};}if(!context){if(reservationPending)return{state:'review',reason:'RESERVATION_UNCERTAIN_REQUIRES_REVIEW'};await recoverJournal(false);paused=false;await persist('idle');return{state:'ready'};}const job=await client.read(context);if(job?.status==='running'&&job.lease_id===context.lease&&job.observation==null&&Date.parse(job.lease_until)>now()+10000){busy=true;try{const journal=await resumeJournal();const recovery=journal.recoveryStage==='history'?await browser('recoverHistory',job.inputs?.document):journal.recoveryStage==='document'?await browser('recoverName',job.inputs?.document):await browser('recoverGreeting');const runner=createPilotRunner({enabled:true,workLine:'573118657153',jobId:job.id,leaseId:context.lease,baselineMessageIds:recovery.baselineMessageIds,readJob:()=>client.read(context),verifySource:()=>client.check(context),verifyView:()=>browser('verifyView'),resolveName:()=>client.name(context),sendText:text=>browser('sendText',text),requestMenu:()=>browser('requestMenu'),finishJob:args=>client.finish(args),record:journal.record,now});const result=await continueConversation(runner,journal.recoveryStage==='history'?await runner.resumeHistory(recovery):journal.recoveryStage==='document'?await runner.resumeDocument(recovery.document):await runner.resumeGreeting(recovery.greeting),journal);if(result.confirmed){paused=false;return{...result,state:'ready'};}return result;}catch(error){return fail(error?.message==='BROWSER_READ_INCOMING_FAILED'?error.message:'RECOVERY_NOT_CONFIRMED');}finally{busy=false;}}if(job?.status==='blocked'&&job.reason_code==='BROWSER_SEND_NOT_CONFIRMED'&&job.lease_id===context.lease&&job.observation==null&&job.checked_at==null){if(!await browser('verifyView'))return{state:'review',reason:'WRONG_VIEW'};await browser('baseline');await recoverJournal(true);context=null;paused=false;await persist('idle');return{state:'ready'};}if(!job||job.completion_lease_id!==context.lease||!['observed','unavailable'].includes(job.status))return{state:'review',reason:'RUNNING_OR_UNCERTAIN_JOB_REQUIRES_REVIEW'};if(!await browser('verifyView'))return{state:'review',reason:'WRONG_VIEW'};await browser('baseline');if(!(await client.release(context)).released)return{state:'review',reason:'CHANNEL_NOT_RELEASED'};await recoverJournal(true);paused=false;context=null;await persist('idle');return{state:'ready'};},
 async tick(){if(busy)return{state:'busy'};if(paused)return{state:'review'};if(!serviceHours(now()))return{state:'outside_hours'};busy=true;let journal=null,journalStarted=false;
 try{const health=await client.status();if(!health.operationalEnabled)return{state:'server_disabled'};if(!(await client.peek()).eligible)return{state:'ready'};
 if(!await browser('verifyView'))return{state:'awaiting_browser'};const baseline=await browser('baseline',freshGreetingRequired?{abandonExpiredGreeting:true}:null);journalStarted=true;journal=await openJournal(journalDirectory);await journal.record({phase:'reservation_intent',kind:'job',stage:'idle',at:new Date(now()).toISOString()});reservationPending=true;await persist('reserving');const job=await client.claim();reservationPending=false;if(!job){await journal.close({confirmedComplete:true});await persist('idle');return{state:'ready'};}context={id:job.id,lease:job.lease_id};freshGreetingRequired=false;reviewReason=null;await persist('reserved');
 const runner=createPilotRunner({enabled:true,workLine:'573118657153',jobId:job.id,leaseId:job.lease_id,baselineMessageIds:baseline,readJob:()=>client.read(context),verifySource:()=>client.check(context),verifyView:()=>browser('verifyView'),resolveName:()=>client.name(context),sendText:text=>browser('sendText',text),requestMenu:()=>browser('requestMenu'),finishJob:args=>client.finish(args),record:journal.record,now});
 return await continueConversation(runner,await runner.begin(),journal);
 }catch(error){if(!context&&!reservationPending&&!journalStarted){await persist('idle');return{state:'awaiting_connection',retryable:true};}return fail(error?.message==='BROWSER_READ_INCOMING_FAILED'?error.message:'OPERATION_UNCERTAIN');}finally{busy=false;}}
 };
}

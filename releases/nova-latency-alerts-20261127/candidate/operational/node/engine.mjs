import{createPilotRunner,serviceHours}from'../lib/krediya-browser-20261103/pilot-runner.mjs';
import{openPilotJournal}from'../lib/krediya-browser-20261103/pilot-journal.mjs';
const closing=text=>/^¡gracias por contactarnos! (?:😊 )?ha sido un placer atenderte y estamos aqui para ti\. ¡que tengas un excelente dia!$/.test(text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase());
// One absolute deadline per bound lease, using the server HTTP Date sample.
export function verifiedClockMargin(sample,at){
 const rtt=sample?.receivedAt-sample?.requestAt;
 if(!Number.isFinite(sample?.serverAt)||!Number.isFinite(rtt)||rtt<0||rtt>5000||at<sample.receivedAt||at-sample.receivedAt>5000||Math.abs(sample.serverAt-sample.receivedAt)>5000)throw Error('CLOCK_NOT_VERIFIED');
 // Date is rounded to seconds; overestimate server time to stop conservatively.
 const upperOffset=Math.max(0,sample.serverAt+rtt+1000-sample.receivedAt);
 return upperOffset;
}
export function conversationDeadline(job,sample,at){
 const lease=Date.parse(job?.lease_until),upperOffset=verifiedClockMargin(sample,at);
 const deadline=Math.min(at+285000,lease-upperOffset-15000);
 if(!Number.isFinite(deadline)||deadline<=at)throw Error('AUTHORIZATION_NOT_CURRENT');
 return deadline;
}
export function createOperationalEngine({client,browser,record,previous={},journalDirectory,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),openJournal=openPilotJournal,resumeJournal=async()=>{throw Error('RECOVERY_NOT_CONFIGURED');},recoverJournal=async()=>{}}){
 let freshGreetingRequired=previous.freshGreetingRequired===true,reviewReason=previous.reason;
 let currentRecoveryTries=Number.isSafeInteger(previous.currentRecoveryTries)?previous.currentRecoveryTries:0;
 let recoveryStep='start',restartPending=previous.restartPending&&typeof previous.restartPending==='object'?previous.restartPending:null,restartTries=Number.isSafeInteger(previous.restartTries)?previous.restartTries:0,recoveryAttempt=Number.isSafeInteger(previous.recoveryAttempt)?previous.recoveryAttempt:0;
 let busy=false,paused=!!(previous.phase&&previous.phase!=='idle'),context=previous.context||null,reservationPending=previous.reservationPending===true;
 const state=()=>({busy,paused,context:context?{id:context.id,lease:context.lease}:null,automaticRecoveryAllowed:!busy&&!context&&!reservationPending});
 async function persist(phase,extra={}){await record({phase,reservationPending,freshGreetingRequired,currentRecoveryTries,restartPending,restartTries,recoveryAttempt,context:context?{id:context.id,lease:context.lease}:null,at:new Date(now()).toISOString(),...extra});}
 async function fail(reason){paused=true;reviewReason=reason;await persist('review',{reason});return{state:'review',reason};}
 async function recoverExpiredGreeting(){
  if(!context||reservationPending||!['SESSION_EXPIRED','EXPIRED_GREETING_RELEASED'].includes(reviewReason))return false;
  if(reviewReason==='EXPIRED_GREETING_RELEASED'){
   await recoverJournal(true);
   context=null;currentRecoveryTries=0;restartPending=null;restartTries=0;recoveryAttempt=0;
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
   context=null;currentRecoveryTries=0;restartPending=null;restartTries=0;recoveryAttempt=0;
   paused=false;
   await persist('idle');
   return true;
  }finally{await journal.close();}
 }
 const restartableJob=job=>job?.id===context?.id&&job?.platform==='KREDIYA'&&job.status==='running'&&job.lease_id===context?.lease&&job.observation==null&&job.checked_at==null&&job.completion_lease_id==null&&Number.isSafeInteger(job.attempts)&&job.attempts>=1&&job.attempts<=3&&Number.isFinite(Date.parse(job.lease_until));
 const knownFailure=()=>['RECOVERY_NOT_CONFIRMED','BROWSER_COMPOSE_FAILED','BROWSER_SNAPSHOT_FAILED','BROWSER_SEND_CLICK_FAILED','BROWSER_SEND_CONFIRM_FAILED','BROWSER_READ_INCOMING_FAILED','AUTHORIZATION_NOT_CURRENT','SESSION_EXPIRED'].includes(reviewReason);
 const recoveryHours=()=>serviceHours(now())&&serviceHours(now()+300000);
 const pendingRestart=job=>!!restartPending&&!!job&&restartPending.jobId===job.id&&restartPending?.leaseId===job?.lease_id&&Number.isSafeInteger(restartPending.expectedAttempts)&&Number.isFinite(Date.parse(restartPending.expiredLeaseUntil));
 const expiredRestart=job=>restartableJob(job)&&recoveryHours()&&knownFailure()&&Date.parse(job.lease_until)<=now()-60000&&job.attempts<3;
 async function restartExpiredConversation(job){
  if(!recoveryHours()||!restartableJob(job)||reservationPending||!pendingRestart(job)&&!expiredRestart(job))return fail('EXPIRED_RESTART_NOT_ALLOWED');
  const journal=await resumeJournal();
  try{
   if(journal.recoveryStage!=='document')return fail('RECOVERY_JOURNAL_REQUIRES_REVIEW');
   if(!expiredRestart(job)&&restartTries>=3)return fail('RECOVERY_RETRY_LIMIT');
   const visibleProof={document:job.inputs.document,requestCreatedAt:job.created_at,documentConfirmedAt:journal.documentConfirmedAt,exclusiveResume:true};
   // Read-only check before renewal; no name or document is sent here.
   await browser('recoverName',visibleProof);
   if(expiredRestart(job)){restartPending={jobId:job.id,leaseId:job.lease_id,expectedAttempts:job.attempts+1,expiredLeaseUntil:job.lease_until};restartTries=0;}
   restartTries++;await persist('restart_prepared',{reason:reviewReason});
   const renewed=(await client.restart(context)).job;
   if(!restartableJob(renewed)||renewed.attempts!==restartPending.expectedAttempts||renewed.lease_id!==restartPending.leaseId||Date.parse(renewed.lease_until)<=Math.max(now()+10000,Date.parse(restartPending.expiredLeaseUntil)+60000)||JSON.stringify([renewed.application_id,renewed.source_application_id,renewed.payload_hash,renewed.inputs])!==JSON.stringify([job.application_id,job.source_application_id,job.payload_hash,job.inputs]))return fail('EXPIRED_RESTART_NOT_ALLOWED');
   if(recoveryAttempt!==renewed.attempts){recoveryAttempt=renewed.attempts;restartTries=1;}
   const deadline=conversationDeadline(renewed,client.clock(),now());await persist('restart_reserved',{reason:reviewReason});
   const recovery=await browser('recoverName',{document:renewed.inputs.document,requestCreatedAt:renewed.created_at,documentConfirmedAt:journal.documentConfirmedAt,exclusiveResume:true});
   const runner=createPilotRunner({enabled:true,workLine:'573118657153',jobId:renewed.id,leaseId:context.lease,baselineMessageIds:recovery.baselineMessageIds,readJob:()=>client.read(context),verifySource:()=>client.check(context),verifyView:()=>browser('verifyView'),resolveName:()=>client.name(context),sendText:text=>browser('sendText',text),requestMenu:()=>browser('requestMenu'),finishJob:args=>client.finish(args),record:journal.record,now,deadline});
   const result=await continueConversation(runner,await runner.resumeDocument(recovery.document),journal,deadline);
   if(result.confirmed){restartPending=null;restartTries=0;recoveryAttempt=0;paused=false;await persist('idle');return{...result,state:'ready'};}return result;
  }finally{await journal.close();}
 }
 async function continueConversation(runner,result,journal,end){if(!Number.isFinite(end))throw Error('INVALID_DEADLINE');while(!runner.status().terminal&&!runner.status().paused&&now()<end){await sleep(1500);if(now()>=end)break;const events=await browser('readIncoming');if(now()>=end)break;if(!Array.isArray(events)||events.length>24)throw Error('INVALID_EVENTS');runner.checkDeadline();for(const e of events){if(now()>=end)break;result=await runner.receive(e);if(runner.status().terminal||runner.status().paused)break;}}
 if(!runner.status().terminal||result.confirmed!==true)return fail(runner.status().lastReason||(now()>=end?'SESSION_EXPIRED':'RESULT_NOT_CONFIRMED'));await persist('saved');
 let informationSent=false;
 if(result.commercialMenu===true){
  await journal.record({phase:'send_intent',kind:'closing',stage:'await_closure',at:new Date(now()).toISOString()});
  if(!await browser('verifyView'))return fail('WRONG_VIEW');
  const ack=await browser('sendText','1');
  if(ack?.confirmed!==true||ack.text!=='1'||!/^[-A-Za-z0-9._=]{1,200}$/.test(ack.messageId||'')||ack.accountPhone!=='573118657153'||ack.providerPhone!=='573155000105')return fail('CLOSURE_SEND_NOT_CONFIRMED');
  await journal.record({phase:'send_confirmed',kind:'closing',stage:'await_close_reply',at:new Date(now()).toISOString()});informationSent=true;
 }
 const closeEnd=now()+30000;let sent=informationSent,closed=false;while(now()<closeEnd&&!closed){if(!sent){await journal.record({phase:'send_intent',kind:'closing',stage:'await_closure',at:new Date(now()).toISOString()});sent=(await browser('requestClose'))?.sent===true;}else{const events=await browser('readIncoming');for(const e of events){if(e.senderPhone!=='573155000105'||e.accountPhone!=='573118657153'||e.direction!=='incoming')throw Error('UNVERIFIED_CLOSE');if(closing(e.text))closed=true;else if(!informationSent)throw Error('UNEXPECTED_CLOSE_REPLY');}}if(!closed)await sleep(1500);}
 if(!closed)return fail('CLOSURE_NOT_CONFIRMED');if(!(await client.release(context)).released)return fail('CHANNEL_NOT_RELEASED');await journal.close({confirmedComplete:true});context=null;currentRecoveryTries=0;restartPending=null;restartTries=0;recoveryAttempt=0;await persist('idle');return{state:'saved',saved:true,confirmed:true,availability:result.availability};
 }
 return{state,
 async status(){const health=await client.status(),local=state();if(health.operationalEnabled&&!busy&&paused&&context&&!reservationPending&&['SESSION_EXPIRED','EXPIRED_GREETING_RELEASED'].includes(reviewReason))local.automaticRecoveryAllowed=true;if(!busy&&paused&&context&&!reservationPending){try{const job=await client.read(context);if(job?.completion_lease_id===context.lease&&['observed','unavailable'].includes(job.status))local.automaticRecoveryAllowed=true;if(health.operationalEnabled&&restartableJob(job)&&(recoveryHours()&&pendingRestart(job)&&restartTries<3||expiredRestart(job)))local.automaticRecoveryAllowed=true;if(['BROWSER_COMPOSE_FAILED','BROWSER_READ_INCOMING_FAILED','RECOVERY_NOT_CONFIRMED'].includes(reviewReason)&&currentRecoveryTries<3&&!pendingRestart(job)&&job?.status==='running'&&job.lease_id===context.lease&&Date.parse(job.lease_until)>now()+10000&&await client.check(context))local.automaticRecoveryAllowed=true;}catch{}}return{...health,...local};},
 async resume(){if(busy)return{state:'busy'};const persistedJob=context?await client.read(context):null;if(context&&['SESSION_EXPIRED','EXPIRED_GREETING_RELEASED'].includes(reviewReason)&&!expiredRestart(persistedJob)&&!pendingRestart(persistedJob)){busy=true;try{if(await recoverExpiredGreeting())return{state:'ready'};}catch{}finally{busy=false;}await persist('review',{reason:reviewReason,recoveryStep});return{state:'review',reason:reviewReason};}if(!context){if(reservationPending)return{state:'review',reason:'RESERVATION_UNCERTAIN_REQUIRES_REVIEW'};await recoverJournal(false);paused=false;await persist('idle');return{state:'ready'};}const job=await client.read(context);if(restartableJob(job)&&(pendingRestart(job)||expiredRestart(job))){busy=true;try{return await restartExpiredConversation(job);}catch(error){return fail(/^BROWSER_/.test(error?.message||'')?error.message:'RECOVERY_NOT_CONFIRMED');}finally{busy=false;}}if(job?.status==='running'&&job.lease_id===context.lease&&job.observation==null&&Date.parse(job.lease_until)>now()+10000){if(currentRecoveryTries>=3)return fail('CURRENT_RECOVERY_RETRY_LIMIT');busy=true;try{const deadline=conversationDeadline(job,client.clock(),now());currentRecoveryTries++;await persist('review',{reason:reviewReason});const journal=await resumeJournal();const recovery=journal.recoveryStage==='history'?await browser('recoverHistory',job.inputs?.document):journal.recoveryStage==='document'?await browser('recoverName',job.inputs?.document):await browser('recoverGreeting');const runner=createPilotRunner({enabled:true,workLine:'573118657153',jobId:job.id,leaseId:context.lease,baselineMessageIds:recovery.baselineMessageIds,readJob:()=>client.read(context),verifySource:()=>client.check(context),verifyView:()=>browser('verifyView'),resolveName:()=>client.name(context),sendText:text=>browser('sendText',text),requestMenu:()=>browser('requestMenu'),finishJob:args=>client.finish(args),record:journal.record,now,deadline});const result=await continueConversation(runner,journal.recoveryStage==='history'?await runner.resumeHistory(recovery):journal.recoveryStage==='document'?await runner.resumeDocument(recovery.document):await runner.resumeGreeting(recovery.greeting),journal,deadline);if(result.confirmed){paused=false;return{...result,state:'ready'};}return result;}catch(error){return fail(error?.message==='BROWSER_READ_INCOMING_FAILED'?error.message:'RECOVERY_NOT_CONFIRMED');}finally{busy=false;}}if(job?.status==='blocked'&&job.reason_code==='BROWSER_SEND_NOT_CONFIRMED'&&job.lease_id===context.lease&&job.observation==null&&job.checked_at==null){if(!await browser('verifyView'))return{state:'review',reason:'WRONG_VIEW'};await browser('baseline');await recoverJournal(true);context=null;currentRecoveryTries=0;restartPending=null;restartTries=0;recoveryAttempt=0;paused=false;await persist('idle');return{state:'ready'};}if(!job||job.completion_lease_id!==context.lease||!['observed','unavailable'].includes(job.status))return{state:'review',reason:'RUNNING_OR_UNCERTAIN_JOB_REQUIRES_REVIEW'};if(!await browser('verifyView'))return{state:'review',reason:'WRONG_VIEW'};await browser('baseline');if(!(await client.release(context)).released)return{state:'review',reason:'CHANNEL_NOT_RELEASED'};await recoverJournal(true);paused=false;context=null;currentRecoveryTries=0;restartPending=null;restartTries=0;recoveryAttempt=0;await persist('idle');return{state:'ready'};},
 async tick(){if(busy)return{state:'busy'};if(paused)return{state:'review'};if(!serviceHours(now()))return{state:'outside_hours'};busy=true;let journal=null,journalStarted=false;
 try{const health=await client.status();if(!health.operationalEnabled)return{state:'server_disabled'};if(!(await client.peek()).eligible)return{state:'ready'};try{verifiedClockMargin(client.clock(),now());}catch{await persist('idle');return{state:'awaiting_connection',retryable:true,reason:'CLOCK_NOT_VERIFIED'};}
 if(!await browser('verifyView'))return{state:'awaiting_browser'};const baseline=await browser('baseline',freshGreetingRequired?{abandonExpiredGreeting:true}:null);journalStarted=true;journal=await openJournal(journalDirectory);await journal.record({phase:'reservation_intent',kind:'job',stage:'idle',at:new Date(now()).toISOString()});reservationPending=true;await persist('reserving');const job=await client.claim();reservationPending=false;if(!job){await journal.close({confirmedComplete:true});await persist('idle');return{state:'ready'};}context={id:job.id,lease:job.lease_id};currentRecoveryTries=0;restartPending=null;restartTries=0;recoveryAttempt=0;freshGreetingRequired=false;reviewReason=null;await persist('reserved');
 const deadline=conversationDeadline(job,client.clock(),now());const runner=createPilotRunner({enabled:true,workLine:'573118657153',jobId:job.id,leaseId:job.lease_id,baselineMessageIds:baseline,readJob:()=>client.read(context),verifySource:()=>client.check(context),verifyView:()=>browser('verifyView'),resolveName:()=>client.name(context),sendText:text=>browser('sendText',text),requestMenu:()=>browser('requestMenu'),finishJob:args=>client.finish(args),record:journal.record,now,deadline});
 return await continueConversation(runner,await runner.begin(),journal,deadline);
 }catch(error){if(!context&&!reservationPending&&!journalStarted){await persist('idle');return{state:'awaiting_connection',retryable:true};}return fail(error?.message==='BROWSER_READ_INCOMING_FAILED'?error.message:'OPERATION_UNCERTAIN');}finally{busy=false;}}
 };
}

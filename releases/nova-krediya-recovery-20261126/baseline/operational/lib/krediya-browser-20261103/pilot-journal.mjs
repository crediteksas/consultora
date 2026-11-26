// Local native-only journal. An uncertain/crashed run retains its lock for review.
import fs from'node:fs/promises';import path from'node:path';import{randomUUID}from'node:crypto';
const phases=new Set(['send_intent','send_confirmed','save_intent','save_confirmed','stopped','reservation_intent','reservation_received','statement_received']);
const kinds=new Set(['greeting','authorized_name','authorized_document','statement_option','statement','operation_error','job','closing','history_menu','history_option']);
const stages=new Set(['idle','await_prompt','await_menu','await_statement','completed','paused','await_closure','await_close_reply','await_history_prompt','await_history_menu','await_history']);
export async function openPilotJournal(directory,{resumeGreeting=false}={}){
 await fs.mkdir(directory,{recursive:true,mode:0o700});
 const lockPath=path.join(directory,'pilot.lock'),logPath=path.join(directory,'pilot.jsonl'),newOwner=randomUUID();let owner=newOwner;
 let handle,recoveryStage='greeting';
 if(resumeGreeting){
  const stat=await fs.lstat(lockPath);if(stat.isSymbolicLink()||stat.mode&0o077)throw Error('PRIVATE_LOCK_REQUIRED');
  const lock=JSON.parse(await fs.readFile(lockPath,'utf8'));if(!/^[a-f0-9-]{36}$/.test(lock.owner||''))throw Error('LOCK_OWNER_REQUIRED');
  const lines=(await fs.readFile(logPath,'utf8')).trim().split('\n').map(JSON.parse),start=lines.findLastIndex(e=>e.phase==='reservation_intent'),tail=lines.slice(start);
  const greeting=start>=0&&tail.length===3&&tail[0].phase==='reservation_intent'&&tail[1].phase==='send_intent'&&tail[1].kind==='greeting'&&tail[2].phase==='send_confirmed'&&tail[2].kind==='greeting'&&tail[2].stage==='await_prompt';
  const name=start>=0&&tail.length===7&&JSON.stringify(tail.map(e=>[e.phase,e.kind,e.stage]))===JSON.stringify([['reservation_intent','job','idle'],['send_intent','greeting','idle'],['send_confirmed','greeting','await_prompt'],['send_intent','authorized_document','await_prompt'],['send_confirmed','authorized_document','await_menu'],['send_intent','authorized_name','await_menu'],['stopped','operation_error','await_menu']]);
  const recoveries=tail.filter(e=>e.phase==='reservation_received');
  const documentConfirmed=start>=0&&recoveries.length<=2&&recoveries.every(e=>e.kind==='job'&&['await_prompt','await_menu'].includes(e.stage))&&new Set(recoveries.map(e=>e.stage)).size===recoveries.length&&JSON.stringify(tail.filter(e=>e.phase!=='reservation_received').map(e=>[e.phase,e.kind,e.stage]))===JSON.stringify([['reservation_intent','job','idle'],['send_intent','greeting','idle'],['send_confirmed','greeting','await_prompt'],['send_intent','authorized_document','await_prompt'],['send_confirmed','authorized_document','await_menu']]);
  const history=start>=0&&tail.at(-1)?.phase==='save_intent'&&tail.at(-1)?.stage==='await_history'||start>=0&&tail.at(-1)?.phase==='stopped'&&tail.at(-1)?.stage==='await_history_prompt'&&tail.at(-2)?.kind==='history_menu'&&tail.at(-2)?.phase==='send_intent'&&tail.some(e=>e.phase==='statement_received');
  if(!greeting&&!name&&!history&&!documentConfirmed)throw Error('GREETING_ONLY_JOURNAL_REQUIRED');recoveryStage=history?'history':name||documentConfirmed?'document':'greeting';
  owner=lock.owner;handle=await fs.open(lockPath,'r');
 }else{handle=await fs.open(lockPath,'wx',0o600);await handle.writeFile(JSON.stringify({owner,status:'manual_review_if_interrupted'})+'\n');await handle.sync();}
 let closed=false;
 return {recoveryStage,async record(e){
  if(closed)throw Error('JOURNAL_CLOSED');
  if(!e||Object.keys(e).some(k=>!['phase','kind','stage','at'].includes(k))||!phases.has(e.phase)||!kinds.has(e.kind)||!stages.has(e.stage)||typeof e.at!=='string'||!Number.isFinite(Date.parse(e.at)))throw Error('INVALID_JOURNAL_ENTRY');
  const file=await fs.open(logPath,'a',0o600);try{await file.writeFile(JSON.stringify({phase:e.phase,kind:e.kind,stage:e.stage,at:e.at})+'\n');await file.sync();}finally{await file.close();}
 },async close({confirmedComplete=false}={}){
  if(closed)return;closed=true;await handle.close();
  if(confirmedComplete){const current=JSON.parse(await fs.readFile(lockPath,'utf8'));if(current.owner!==owner)throw Error('LOCK_OWNER_CHANGED');await fs.unlink(lockPath);}
 }};
}

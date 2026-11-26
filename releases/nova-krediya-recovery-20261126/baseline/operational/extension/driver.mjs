import{pageOperation}from'./page.mjs';import{providerMetadata}from'./shared/provider.mjs';
const closeText=t=>/^¡gracias por contactarnos! (?:😊 )?ha sido un placer atenderte y estamos aqui para ti\. ¡que tengas un excelente dia!$/.test(t.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase());
export function createChromeDriver({chrome,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 let tabId=null,lastSentId=null,started=0,verified=0,firstSeen=new Set();
 async function operation(action,value){if(tabId===null)throw Error('TAB_REQUIRED');const t=await chrome.tabs.get(tabId);if(new URL(t.url).origin!=='https://web.whatsapp.com')throw Error('WRONG_ORIGIN');const r=await chrome.scripting.executeScript({target:{tabId},world:'ISOLATED',func:pageOperation,args:[action,value??null]});if(r.length!==1)throw Error('AMBIGUOUS_FRAME');return r[0].result;}
 async function wait(fn,timeout=6000){const end=now()+timeout;while(now()<end){const r=await fn();if(r)return r;await sleep(200);}throw Error('UI_TIMEOUT');}
 async function snapshot(){if(!await operation('panels-closed')){await operation('panel-close');await wait(()=>operation('panels-closed'));}await operation('scroll-bottom');await wait(()=>operation('at-bottom'));return wait(async()=>{const value=await operation('snapshot');return value?.pendingMessages?false:value;});}
 async function verifyView(){verified=0;const tabs=await chrome.tabs.query({url:'https://web.whatsapp.com/*'});if(tabs.length!==1)throw Error('ONE_WHATSAPP_TAB_REQUIRED');tabId=tabs[0].id;await snapshot();await operation('profile-open');const own=await wait(()=>operation('profile-check'));if(!await operation('panel-close'))throw Error('PROFILE_CLOSE_REQUIRED');await wait(()=>operation('panels-closed'));if(!own)return false;await operation('contact-open');const peer=await wait(()=>operation('contact-check'));if(!await operation('panel-close'))throw Error('CONTACT_CLOSE_REQUIRED');await wait(()=>operation('panels-closed'));if(!peer)return false;await snapshot();verified=now();return true;}
 async function baseline(options){const v=await snapshot();if(v.draft!==''||!v.messages.length)throw Error('EMPTY_DRAFT_AND_CLOSED_CHAT_REQUIRED');const last=v.messages.at(-1),clean=v.messages.every(m=>m.direction==='outgoing'&&['Hola','Hola KrediYa'].includes(m.text));const normalized=last.text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 const isFreshStart=options?.abandonExpiredGreeting===true&&last.direction==='unverified'&&
  providerMetadata(last.metadata,'573155000105')!==null&&
  /^(?:comparteme tu numero de cedula, por favor\.|¿?me indica su numero de cedula\?)$/.test(normalized);
 if(!clean&&!isFreshStart&&(last.direction==='outgoing'||providerMetadata(last.metadata,'573155000105')===null||!closeText(last.text)))throw Error('PREVIOUS_CONVERSATION_NOT_CLOSED');started=now();lastSentId=null;firstSeen=new Set(v.messages.map(m=>m.id));return [...firstSeen];}
 async function sendText(text){
 let step='SNAPSHOT';
 try{
  if(now()-verified>15000)throw Error('VIEW_RECHECK_REQUIRED');
  const before=await snapshot(),ids=new Set(before.messages.map(m=>m.id));
  step='COMPOSE';if(before.draft!=='')throw Error('DRAFT_PRESENT');
  let composed=false;
  await wait(async()=>{
   const draft=(await snapshot()).draft;
   if(composed&&draft===text)return true;
   if(draft!=='')throw Error('UNEXPECTED_DRAFT');
   composed=await operation('compose',text)||composed;
   return false;
  });
  step='SEND_CLICK';await operation('send',text);
  step='SEND_CONFIRM';const sent=await wait(async()=>{const v=await snapshot();const rows=v.messages.filter(m=>!ids.has(m.id)&&m.direction==='outgoing'&&m.text===text);if(rows.length>1)throw Error('AMBIGUOUS_SEND');return rows[0];});
  lastSentId=sent.id;firstSeen.add(sent.id);return{confirmed:true,messageId:sent.id,text,accountPhone:'573118657153',providerPhone:'573155000105'};
 }catch{throw Error('BROWSER_'+step+'_FAILED');}
 }
 async function recoverGreeting(){
 if(!await verifyView())throw Error('WRONG_VIEW');const v=await snapshot();if(v.draft!=='')throw Error('DRAFT_PRESENT');
 let index=-1;for(let i=0;i<v.messages.length;i++)if(v.messages[i].direction==='outgoing')index=i;
 const own=v.messages[index],following=v.messages.slice(index+1);
 if(!own||own.text!=='Hola KrediYa'||!following.length||following.some(m=>m.direction==='outgoing'||providerMetadata(m.metadata,'573155000105')===null)||!following.some(m=>/^(?:comparteme tu numero de cedula, por favor\.|¿?me indica su numero de cedula\?)$/.test(m.text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase())))throw Error('NO_PENDING_DOCUMENT_PROMPT');
 const at=providerMetadata(following.at(-1).metadata,'573155000105');if(at>now()||now()-at>2*3600000)throw Error('PROMPT_TOO_OLD');
 started=Math.min(...following.map(m=>providerMetadata(m.metadata,'573155000105')));lastSentId=own.id;firstSeen=new Set(v.messages.slice(0,index+1).map(m=>m.id));
 return{baselineMessageIds:v.messages.slice(0,index).map(m=>m.id),greeting:{confirmed:true,messageId:own.id,text:own.text,accountPhone:'573118657153',providerPhone:'573155000105'}};
 }
 async function recoverName(document){
 if(!/^\d{6,12}$/.test(document||'')||!await verifyView())throw Error('WRONG_VIEW');
 const v=await snapshot();if(v.draft!=='')throw Error('DRAFT_PRESENT');
 let index=-1;for(let i=0;i<v.messages.length;i++)if(v.messages[i].direction==='outgoing')index=i;
 const own=v.messages[index],following=v.messages.slice(index+1);
 if(!own||own.text!==document||!following.length||following.some(m=>m.direction==='outgoing'||providerMetadata(m.metadata,'573155000105')===null)||(!following.some(m=>m.text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[*_]/g,'').trim().toLowerCase()==='me brinda por favor su nombre y apellido')&&!following.some(m=>/^(?:comparteme tu numero de cedula, por favor\.|¿?me indica su numero de cedula\?)$/.test(m.text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()))))throw Error('NO_PENDING_NAME_PROMPT');
 const at=providerMetadata(following.at(-1).metadata,'573155000105');if(at>now()||now()-at>2*3600000)throw Error('PROMPT_TOO_OLD');
 started=Math.min(...following.map(m=>providerMetadata(m.metadata,'573155000105')));lastSentId=own.id;firstSeen=new Set(v.messages.slice(0,index+1).map(m=>m.id));
 return{baselineMessageIds:v.messages.slice(0,index).map(m=>m.id),document:{confirmed:true,messageId:own.id,text:document,accountPhone:'573118657153',providerPhone:'573155000105'}};
 }
 async function readIncoming(){
  let reason='READ_FAILED';
  for(let attempt=0;attempt<3;attempt++)try{
   if(!lastSentId)return[];
   const v=await snapshot(),pos=v.messages.findIndex(m=>m.id===lastSentId);
   if(pos<0)throw Error('LAST_SEND_NOT_VISIBLE');
   const events=[],ids=[];
   for(const m of v.messages.slice(pos+1)){
    if(firstSeen.has(m.id))continue;
    if(m.direction==='outgoing')throw Error('UNEXPECTED_USER_SEND');
    const at=providerMetadata(m.metadata,'573155000105');
    if(at===null||at<Math.floor(started/60000)*60000||at>now())throw Error('UNKNOWN_AUTHOR_OR_TIME');
    ids.push(m.id);events.push({messageId:m.id,text:m.text,direction:'incoming',accountPhone:'573118657153',senderPhone:'573155000105',receivedAt:new Date(now()).toISOString()});
   }
   if(events.length>24||JSON.stringify(events).length>32768)throw Error('OVERSIZE_EVENTS');
   // Commit deduplication only after the complete batch passes validation.
   for(const id of ids)firstSeen.add(id);
   return events;
  }catch(error){
   reason=['LAST_SEND_NOT_VISIBLE','UNEXPECTED_USER_SEND','UNKNOWN_AUTHOR_OR_TIME','OVERSIZE_EVENTS','UI_TIMEOUT','INVALID_MESSAGE','CAPTURE_TOO_LARGE','WRONG_CHAT'].includes(error?.message)?error.message:'READ_FAILED';
   if(reason==='UNEXPECTED_USER_SEND'||reason==='OVERSIZE_EVENTS')break;
   if(attempt<2)await sleep(250);
  }
  if(chrome.storage?.local)await chrome.storage.local.set({readDiagnostic:{reason,at:new Date(now()).toISOString()}}).catch(()=>{});
  throw Error('BROWSER_READ_INCOMING_FAILED');
 }

 async function recoverHistory(document){
 if(!/^\d{6,12}$/.test(document||'')||!await verifyView())throw Error('WRONG_VIEW');
 const v=await snapshot();if(v.draft!=='')throw Error('DRAFT_PRESENT');
 let di=-1,si=-1;for(let i=0;i<v.messages.length;i++){const m=v.messages[i];if(m.direction==='outgoing'&&m.text===document)di=i;if(m.direction==='outgoing'&&/^(?:✅\s*)?SI$/.test(m.text))si=i;}
 const own=v.messages[di],menuAck=v.messages[si],section=v.messages.slice(di+1,si);
 const tailAll=v.messages.slice(si+1),historySent=tailAll.findIndex(m=>m.direction==='outgoing'&&m.text==='4'),tail=historySent<0?tailAll:tailAll.slice(historySent+1);
 const historyReply=historySent>=0&&tail.length>=2&&/^queremos asegurarnos de que todo este claro/i.test(tail.at(-1).text.normalize('NFD').replace(/[\u0300-\u036f]/g,''));
 const statement=section.filter(m=>/Monto pagado:/.test(m.text)&&/Crédito:/.test(m.text));
 if(di<0||si<=di||statement.length!==1||!tail.length||tail.some(m=>m.direction==='outgoing'||providerMetadata(m.metadata,'573155000105')===null)||(!historyReply&&!tail.some(m=>/Visualizar el historial de pagos/.test(m.text))))throw Error('NO_PENDING_HISTORY_MENU');
 if(section.some(m=>m.direction==='outgoing'&&m.text!=='1')||section.some(m=>m.direction!=='outgoing'&&providerMetadata(m.metadata,'573155000105')===null))throw Error('HISTORY_SEQUENCE_MISMATCH');
 const at=providerMetadata(statement[0].metadata,'573155000105');if(at===null||at>now()||now()-at>300000)throw Error('STATEMENT_TOO_OLD');
 started=at;lastSentId=menuAck.id;firstSeen=new Set(v.messages.slice(0,si+1).map(m=>m.id));
 return{...(historyReply?{historyEvent:{text:tail.slice(0,-1).map(m=>m.text).join('\n'),messageId:tail[0].id,receivedAt:new Date(now()).toISOString()}}:{}),baselineMessageIds:v.messages.slice(0,si).map(m=>m.id),documentMessageId:own.id,
 statement:{text:statement[0].text,messageId:statement[0].id,receivedAt:new Date(at).toISOString(),senderPhone:'573155000105',accountPhone:'573118657153',direction:'incoming'},
 ack:{confirmed:true,messageId:menuAck.id,text:'SI',accountPhone:'573118657153',providerPhone:'573155000105'}};
 }
 async function requestMenu(){
 if(!await verifyView())throw Error('WRONG_VIEW');
 const before=await snapshot(),last=before.messages.at(-1);
 if(!/^te puedo ayudar en algo mas\b/i.test((last?.text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''))||providerMetadata(last?.metadata,'573155000105')===null)throw Error('MENU_PROMPT_REQUIRED');
 const ids=new Set(before.messages.map(m=>m.id));
 await operation('continue-request',{messageId:last.id});
 const sent=await wait(async()=>{const v=await snapshot();return v.messages.find(m=>!ids.has(m.id)&&m.direction==='outgoing'&&/^(?:✅\s*)?SI$/.test(m.text.trim()));});
 lastSentId=sent.id;firstSeen.add(sent.id);
 return{confirmed:true,messageId:sent.id,text:'SI',accountPhone:'573118657153',providerPhone:'573155000105'};
 }
 async function requestClose(){if(!await verifyView())throw Error('WRONG_VIEW');const before=await snapshot(),last=before.messages.at(-1);if(!/(?:te puedo ayudar en algo mas\b|queremos asegurarnos de que todo este claro.*validar algun pago)/i.test((last?.text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''))||providerMetadata(last?.metadata,'573155000105')===null)return{sent:false};const ids=new Set(before.messages.map(m=>m.id));await operation('close-request',{messageId:last.id});const sent=await wait(async()=>{const v=await snapshot();return v.messages.find(m=>!ids.has(m.id)&&m.direction==='outgoing'&&/NO\s*$/.test(m.text));});lastSentId=sent.id;firstSeen.add(sent.id);return{sent:true};}
 return{verifyView,baseline,sendText,readIncoming,requestClose,requestMenu,recoverGreeting,recoverName,recoverHistory};
}

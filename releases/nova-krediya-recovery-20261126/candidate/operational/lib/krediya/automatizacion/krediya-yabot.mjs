// Pure protocol layer. NO WhatsApp sends, database writes or credit decisions.
// A production driver must own an exclusive durable lease for the bot channel,
// authenticate webhook sender, reload consent, persist each transition and
// dispatch commands with an outbox. Context below is server-trusted, not HTTP input.
export const YABOT_PHONE = '573155000105';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[*_]/g,'').trim().toLowerCase();
const unavailable = reason => ({platform:'KREDIYA',availability:'unavailable',reason,creditDecision:null});
const validTime = (s,now) => typeof s==='string' && Number.isFinite(Date.parse(s)) && Date.parse(s)<=now;
function money(s) {
  const v=s.trim().replace(/^\$\s*/,'');
  if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(v))return null;
  const n=Number(v.replace(/\./g,'').replace(',','.'));
  return Number.isFinite(n)&&n>=0&&n<=1e12?n:null;
}
function calendarDate(s) {
  const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if(!m)return null;
  const iso=`${m[3]}-${m[2]}-${m[1]}`,date=new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===iso?iso:null;
}
// Only the documented, complete "Estado de cuenta" message is recognized.
// Missing, malformed or contradictory fields are never converted to zero.
export function parseYabotStatement(text,checkedAt,now=Date.now()) {
  if(typeof text!=='string'||text.length>8192||!validTime(checkedAt,now))return unavailable('INVALID_STATEMENT');
  const fields=new Map();
  const labels=new Set(['monto pagado','proximo pago','proxima fecha a pagar','monto restante','atraso','cuotas atrasadas','credito','estado']);
  const lines=text.split(/\r?\n/);
  for(let i=0;i<lines.length;i++) {
    const line=lines[i];
    const colon=line.indexOf(':');if(colon<0)continue;
    const key=normalize(line.slice(0,colon));if(!labels.has(key))continue;
    if(fields.has(key))return unavailable('DUPLICATE_STATEMENT_FIELD');
    let value=line.slice(colon+1).replace(/[*_]/g,'').trim();
    // Accept one explicit value on the next nonblank line, never another label.
    if(!value){
      let j=i+1;while(j<lines.length&&!lines[j].trim())j++;
      if(j<lines.length&&!lines[j].includes(':')){value=lines[j].replace(/[*_]/g,'').trim();i=j;}
    }
    fields.set(key,value);
  }
  if(fields.size!==labels.size)return unavailable('INCOMPLETE_STATEMENT');
  const amounts=['monto pagado','proximo pago','monto restante','atraso'].map(k=>money(fields.get(k)));
  const dueDate=calendarDate(fields.get('proxima fecha a pagar'));
  const installments=fields.get('cuotas atrasadas'),contract=fields.get('credito'),status=fields.get('estado');
  if(amounts.some(v=>v===null)||!dueDate||!/^\d{1,4}$/.test(installments)||
     !/^[a-z0-9-]{3,64}$/i.test(contract)||!/^(?:FIRMADO|PAGADO|CERRADO|CASTIGADO|VENCIDO)$/i.test(status))return unavailable('UNRECOGNIZED_STATEMENT');
  if((amounts[3]===0)!==(Number(installments)===0))return unavailable('CONTRADICTORY_STATEMENT');
  if(status.toUpperCase()==='PAGADO'&&(amounts[1]!==0||amounts[2]!==0||amounts[3]!==0||Number(installments)!==0))return unavailable('CONTRADICTORY_STATEMENT');
  if(status.toUpperCase()==='CERRADO'&&amounts[2]===0&&(amounts[1]!==0||amounts[3]!==0||Number(installments)!==0))return unavailable('CONTRADICTORY_STATEMENT');
  return {platform:'KREDIYA',availability:'observed',checkedAt,currency:'COP',
    paidAmount:amounts[0],nextPaymentAmount:amounts[1],remainingBalance:amounts[2],
    overdueAmount:amounts[3],overdueInstallments:Number(installments),dueDate,
    providerContractId:contract,providerStatus:status.toUpperCase(),
    identityStatus:'provider_match_requires_case_verification',creditDecision:null};
}
function authorized(ctx,now) {
  const a=ctx?.authorization;
  return UUID.test(ctx?.applicationId)&&UUID.test(ctx?.sessionId)&&HASH.test(ctx?.sourceFingerprint)&&
    /^\d{6,12}$/.test(ctx?.document)&&a?.purpose==='platform_query'&&a.platform==='KREDIYA'&&
    a.applicationId===ctx.applicationId&&a.sourceFingerprint===ctx.sourceFingerprint&&
    a.granted===true&&a.revoked===false&&UUID.test(a.evidenceId)&&validTime(a.acceptedAt,now)&&
    Date.parse(a.expiresAt)>now&&ctx.channelLease?.sessionId===ctx.sessionId&&
    ctx.channelLease?.exclusive===true&&Date.parse(ctx.channelLease.expiresAt)>now;
}
export function startYabot(ctx,now=Date.now()) {
  if(!authorized(ctx,now))return {state:null,commands:[],result:unavailable('AUTHORIZATION_OR_LEASE_REQUIRED')};
  return {state:{schema:'nova-yabot-v1',applicationId:ctx.applicationId,sourceFingerprint:ctx.sourceFingerprint,
    sessionId:ctx.sessionId,stage:'await_document_prompt',startedAt:new Date(now).toISOString(),
    deadline:new Date(now+120000).toISOString(),seen:[]},commands:[{type:'send_text',to:YABOT_PHONE,text:'Hola KrediYa'}],result:null};
}
export async function advanceYabot(state,event,ctx,now=Date.now()) {
  const stop=reason=>({state:state?{...structuredClone(state),stage:'stopped'}:null,commands:[],result:unavailable(reason)});
  if(!state||state.schema!=='nova-yabot-v1'||!Array.isArray(state.seen)||state.seen.length>24)return stop('INVALID_SESSION');
  if(!authorized(ctx,now)||state.applicationId!==ctx.applicationId||state.sourceFingerprint!==ctx.sourceFingerprint||state.sessionId!==ctx.sessionId)return stop('AUTHORIZATION_OR_LEASE_REQUIRED');
  if(event?.verifiedWebhook!==true||event.from!==YABOT_PHONE||event.sessionId!==state.sessionId||
     typeof event.id!=='string'||!/^[-a-zA-Z0-9._=]{1,200}$/.test(event.id)||typeof event.text!=='string'||event.text.length>8192||
     !validTime(event.receivedAt,now)||Date.parse(event.receivedAt)<Date.parse(state.startedAt))return stop('UNTRUSTED_EVENT');
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(event.text));
  const digest=Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
  const prior=state.seen.find(e=>e.id===event.id);
  if(prior)return prior.digest===digest?{state:structuredClone(state),commands:[],result:null}:stop('CHANGED_REPLAY');
  if(!Number.isFinite(Date.parse(state.deadline))||now>=Date.parse(state.deadline))return stop('SESSION_EXPIRED');
  if(['completed','stopped'].includes(state.stage))return {state:structuredClone(state),commands:[],result:null};
  if(state.seen.length>=24)return stop('MESSAGE_LIMIT_EXCEEDED');
  const next=structuredClone(state);next.seen.push({id:event.id,digest});
  const text=normalize(event.text);
  if(/\b(otp|contrasena|codigo de verificacion|codigo de seguridad)\b/.test(text))return stop('ADDITIONAL_AUTHENTICATION_REQUIRED');
  if(state.stage==='await_document_prompt'&&/¿?me indica su numero de cedula\?/.test(text)) {
    next.stage='await_menu';
    // Document stays in protected case storage. Driver resolves it only at send.
    return {state:next,commands:[{type:'send_authorized_document',to:YABOT_PHONE}],result:null};
  }
  if(state.stage==='await_document_prompt'){
    const greeting=/^¡?hola! soy yabot, tu asistente virtual de kredi(?:ya| ya) en colombia(?:\s*🇨🇴)?\s*\.?\s*¡?gracias por contactarnos!$/.test(text);
    const hours='quiero contarte que nuestro horario de atencion personalizada es de lunes a domingos de 8:00 a.m a 8:00 p.m. te invitamos a comunicarte dentro de estos horarios en donde nuestro equipo estara disponible para ayudarte. ¡estaremos encantados de atenderte! ¡gracias por confiar en nosotros! atentamente, equipo atc krediya colombia';
    if(greeting||text.replace(/\s+/g,' ')===hours)return {state:next,commands:[],result:null,waiting:true};
  }
  const noMatchLine=`no hemos encontrado una coincidencia con la cedula ${ctx.document}`;
  if(state.stage==='await_menu'&&text.split(/\r?\n/).some(line=>line.trim()===noMatchLine||line.trim()===noMatchLine+'.')) {
    next.stage='completed';return {state:next,commands:[],result:{platform:'KREDIYA',availability:'no_match',checkedAt:event.receivedAt,remainingBalance:null,creditDecision:null}};
  }
  if(state.stage==='await_menu'&&/1[\ufe0f\u20e3\s.]*estado de cuenta/.test(text)&&/2[\ufe0f\u20e3\s.]*cronograma de pagos/.test(text)) {
    next.stage='await_statement';return {state:next,commands:[{type:'send_text',to:YABOT_PHONE,text:'1'}],result:null};
  }
  if(state.stage==='await_statement') {
    if(text==='adjunto informacion del estado de cuenta')return {state:next,commands:[],result:null,waiting:true};
    const result=parseYabotStatement(event.text,event.receivedAt,now);
    next.stage=result.availability==='observed'?'completed':'stopped';return {state:next,commands:[],result};
  }
  return stop('UNRECOGNIZED_BOT_STEP');
}

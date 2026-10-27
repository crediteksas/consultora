export const REFERENCE_TEMPLATE={name:'nova_referencia_directa_v1',language:'es_CO',category:'UTILITY',components:[{type:'BODY',text:'Creditek recibió tus datos como referencia de {{1}} para una solicitud. Participar es voluntario y no te convierte en deudor ni fiador. Si deseas responder, abre este enlace desde tu WhatsApp y envía el mensaje a NOVA: {{2}}. Allí podrás autorizar la validación o indicar que no deseas participar. Política: https://registro.crediteksas.com/creditek/legal/',example:{body_text:[['Persona de ejemplo','https://wa.me/573011105337?text=REFERENCIA%20ejemplo']]}}]};
const key='nova:retail:templates:v1';
async function bounded(r){const text=await r.text();if(text.length>65536)throw Error('RESPONSE_TOO_LARGE');return JSON.parse(text);}
export async function prepareTemplates(env,fetcher=fetch){
 if(env.NOVA_RETAIL_PREPARE_ENABLED!=='true'||!env.NOVA_META_ACCESS_TOKEN||!env.NOVA_EVENTS)return;
 const before=await env.NOVA_EVENTS.get(key,'json')||{};
 if(before.checkedAt>Date.now()-60000)return before;
 const state={checkedAt:Date.now(),reference:'UNAVAILABLE',staff:'UNAVAILABLE',referenceSubmitted:before.referenceSubmitted===true};
 try{
  for(const [kind,name]of [['reference',REFERENCE_TEMPLATE.name],['staff','nova_aviso_ejecutivo_v1']]){
   const url='https://graph.facebook.com/v26.0/'+env.NOVA_WABA_ID+'/message_templates';
   const r=await fetcher(url+'?name='+name+'&fields=id,name,status,language,category,components&limit=20',{headers:{authorization:'Bearer '+env.NOVA_META_ACCESS_TOKEN},redirect:'manual',signal:AbortSignal.timeout(8000)});
   if(!r.ok){const d=await bounded(r);state[kind+'Diagnostic']={http:r.status,code:d.error?.code??null,subcode:d.error?.error_subcode??null};continue;}const d=await bounded(r);
   const t=d.data?.find(t=>t.name===name&&t.language==='es_CO');
   if(t){state[kind]=t.status;if(kind==='reference'&&(t.category!=='UTILITY'||t.components?.find(c=>c.type==='BODY')?.text!==REFERENCE_TEMPLATE.components[0].text))state.reference='CONTENT_MISMATCH';}
   else if(kind==='reference'&&!state.referenceSubmitted){
    state.referenceSubmitted=true;await env.NOVA_EVENTS.put(key,JSON.stringify(state));
    const sent=await fetcher(url,{method:'POST',headers:{authorization:'Bearer '+env.NOVA_META_ACCESS_TOKEN,'content-type':'application/json'},body:JSON.stringify(REFERENCE_TEMPLATE),redirect:'manual',signal:AbortSignal.timeout(10000)});
    const response=await bounded(sent);state.reference=sent.ok?(response.status||'PENDING'):'SUBMISSION_FAILED';state.errorCode=Number.isSafeInteger(response.error?.code)?response.error.code:null;
   }else if(kind==='reference')state.reference='SUBMISSION_UNCONFIRMED';
  }
 }catch(e){state.checkFailed=true;state.failureKind={name:String(e?.name||'Error').slice(0,40),message:String(e?.message||'request_failed').slice(0,180)};}
 state.ready=state.reference==='APPROVED'&&state.staff==='APPROVED';
 await env.NOVA_EVENTS.put(key,JSON.stringify(state));return state;
}
export async function templateHealth(env){const s=await env.NOVA_EVENTS?.get(key,'json');return {version:'retail-20261020-v1',pilotActive:env.NOVA_RETAIL_ENABLED==='true',reference:s?.reference||'NOT_CHECKED',staff:s?.staff||'NOT_CHECKED',ready:s?.ready===true,checkedAt:s?.checkedAt||null,referenceDiagnostic:s?.referenceDiagnostic||null,staffDiagnostic:s?.staffDiagnostic||null,failure:s?.failureKind||null};}

// Proposal only. Reads template metadata; it never creates templates or sends messages.
export const REFERENCE_TEMPLATE_V1 = {name:'nova_referencia_directa_v1',language:'es_CO',category:'UTILITY',components:[{type:'BODY',text:'Creditek recibió tus datos como referencia de {{1}} para una solicitud. Participar es voluntario y no te convierte en deudor ni fiador. Si deseas responder, abre este enlace desde tu WhatsApp y envía el mensaje a NOVA: {{2}}. Allí podrás autorizar la validación o indicar que no deseas participar. Política: https://registro.crediteksas.com/creditek/legal/',example:{body_text:[['Persona de ejemplo','https://wa.me/573011105337?text=REFERENCIA%20ejemplo']]}}]};
export const REFERENCE_TEMPLATE = {name:'nova_referencia_visual_v2',language:'es_CO',category:'UTILITY',components:[{type:'HEADER',format:'IMAGE'},{type:'BODY',text:'¿Nos ayudas con una referencia? Te registraron como referencia de {{1}}. Participar es voluntario y no te convierte en deudor ni fiador. Elige una opción para continuar. Política: https://registro.crediteksas.com/creditek/legal/',example:{body_text:[['Persona de ejemplo']]}},{type:'BUTTONS',buttons:[{type:'QUICK_REPLY',text:'Responder referencia'},{type:'QUICK_REPLY',text:'No participar'}]}]};
export const TEMPLATE_STATE_KEY = 'nova:retail:templates:v2';
export const PINNED_LOGO_URL = 'https://creditek-nova.comercial-853.workers.dev/branding/creditek-logo.png';
export const PINNED_LOGO_SHA256 = '286b93a7e3d0f00e013b60f138e41fa7d36402b76cfeaad67ad36eb06cb3baff';
const MAX_STATE_AGE_MS = 300000;
const STATES = new Set(['APPROVED','PENDING','REJECTED','PAUSED','DISABLED','IN_APPEAL','PENDING_DELETION','DELETED','LIMIT_EXCEEDED']);
const normalizedType = value => typeof value === 'string' ? value.toUpperCase() : '';

export function referenceTemplateCreatePayload(sampleHandle) {
  if(typeof sampleHandle!=='string'||!sampleHandle.trim()||sampleHandle.length>8192||/[\r\n]/.test(sampleHandle)||/^https?:/i.test(sampleHandle)||/^\d+$/.test(sampleHandle))throw Error('INVALID_HEADER_SAMPLE_HANDLE');
  const template=structuredClone(REFERENCE_TEMPLATE);
  template.components[0].example={header_handle:[sampleHandle]};
  return template;
}

export function validateReferenceTemplate(template,version='v2') {
  const expected=version==='v1'?REFERENCE_TEMPLATE_V1:REFERENCE_TEMPLATE;
  if(!template||template.name!==expected.name||template.language!==expected.language||template.category!==expected.category)return false;
  if(template.parameter_format!==undefined&&template.parameter_format!=='POSITIONAL')return false;
  if(!Array.isArray(template.components)||template.components.length!==expected.components.length)return false;
  for(let i=0;i<expected.components.length;i++){
    const actual=template.components[i],wanted=expected.components[i];
    if(!actual||normalizedType(actual.type)!==wanted.type)return false;
    if(wanted.type==='HEADER'&&(actual.format!=='IMAGE'||actual.text!==undefined))return false;
    if(wanted.type==='BODY'&&(actual.text!==wanted.text||actual.format!==undefined))return false;
    if(wanted.type==='BUTTONS'){
      if(!Array.isArray(actual.buttons)||actual.buttons.length!==2)return false;
      for(let j=0;j<2;j++){
        const button=actual.buttons[j];
        if(normalizedType(button?.type)!=='QUICK_REPLY'||button.text!==wanted.buttons[j].text||Object.keys(button).some(k=>!['type','text'].includes(k)))return false;
      }
    }
  }
  return true;
}

export function referenceHeaderReady(state,now=Date.now()) {
  return state?.headerVerified===true&&state.headerUrl===PINNED_LOGO_URL&&state.headerSha256===PINNED_LOGO_SHA256&&Number.isFinite(state.headerCheckedAt)&&state.headerCheckedAt<=now&&now-state.headerCheckedAt<=MAX_STATE_AGE_MS;
}

export function selectTemplate(state,now=Date.now()) {
  if(!Number.isFinite(state?.checkedAt)||state.checkedAt>now||now-state.checkedAt>MAX_STATE_AGE_MS)return null;
  if(state.referenceV2==='APPROVED'&&referenceHeaderReady(state,now))return {name:REFERENCE_TEMPLATE.name,language:'es_CO',version:'v2',headerUrl:PINNED_LOGO_URL};
  if(state.referenceV1==='APPROVED')return {name:REFERENCE_TEMPLATE_V1.name,language:'es_CO',version:'v1',headerUrl:null};
  return null;
}

export function referenceTemplateMessageComponents(nombre,payloads,headerUrl=PINNED_LOGO_URL) {
  if(typeof nombre!=='string'||!nombre.trim()||nombre.length>200||/[\r\n\t]/.test(nombre)||/ {5}/.test(nombre))throw Error('INVALID_REFERENCE_CUSTOMER_NAME');
  if(headerUrl!==PINNED_LOGO_URL)throw Error('INVALID_REFERENCE_HEADER_MEDIA');
  // Conservative local cap: ASCII <=128 bytes. Use short opaque action handles,
  // never the existing >128-char signed invitation or customer data in payloads.
  if(!Array.isArray(payloads)||payloads.length!==2||payloads[0]===payloads[1]||payloads.some(p=>typeof p!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(p)))throw Error('INVALID_REFERENCE_BUTTON_PAYLOADS');
  return [{type:'header',parameters:[{type:'image',image:{link:PINNED_LOGO_URL}}]},{type:'body',parameters:[{type:'text',text:nombre}]},...payloads.map((payload,index)=>({type:'button',sub_type:'quick_reply',index:String(index),parameters:[{type:'payload',payload}]}))];
}

async function boundedTemplateBytes(response,maxBytes) {
  if(Number(response.headers.get('content-length'))>maxBytes)throw Error('RESPONSE_TOO_LARGE');
  if(!response.body)throw Error('INVALID_RESPONSE');
  const reader=response.body.getReader(),chunks=[];let count=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>maxBytes)throw Error('RESPONSE_TOO_LARGE');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}
  const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return bytes;
}

async function boundedTemplateJson(response) {
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedTemplateBytes(response,65536)));
}

export async function verifyPinnedReferenceLogo(fetcher=fetch,{now=Date.now}={}) {
  const result={headerVerified:false,headerUrl:PINNED_LOGO_URL,headerSha256:null,headerCheckedAt:now()};
  try{
    const response=await fetcher(PINNED_LOGO_URL,{method:'GET',headers:{accept:'image/png'},redirect:'manual',signal:AbortSignal.timeout(8000)});
    if(!response.ok||response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='image/png'){await response.body?.cancel();return result;}
    const bytes=await boundedTemplateBytes(response,262144);
    if(bytes.length<8||![137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value))return result;
    result.headerSha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
    result.headerVerified=result.headerSha256===PINNED_LOGO_SHA256;
  }catch{}
  return result;
}

export async function prepareTemplates(env,fetcher=fetch,{now=Date.now}={}) {
  if(env.NOVA_RETAIL_PREPARE_ENABLED!=='true'||!env.NOVA_META_ACCESS_TOKEN||!env.NOVA_EVENTS)return;
  const before=await env.NOVA_EVENTS.get(TEMPLATE_STATE_KEY,'json')||{};
  if(before.checkedAt<=now()&&before.checkedAt>now()-60000)return before;
  const state={checkedAt:now(),referenceV1:'UNAVAILABLE',referenceV2:'UNAVAILABLE',staff:'UNAVAILABLE'};
  for(const [kind,name,version]of [['referenceV1',REFERENCE_TEMPLATE_V1.name,'v1'],['referenceV2',REFERENCE_TEMPLATE.name,'v2'],['staff','nova_aviso_ejecutivo_v1',null]]){
    try{
      const url='https://graph.facebook.com/v26.0/'+env.NOVA_WABA_ID+'/message_templates?name='+name+'&fields=id,name,status,language,category,components&limit=20';
      const response=await fetcher(url,{method:'GET',headers:{authorization:'Bearer '+env.NOVA_META_ACCESS_TOKEN},redirect:'manual',signal:AbortSignal.timeout(8000)});
      const data=await boundedTemplateJson(response);
      if(!response.ok){state[kind+'Diagnostic']={http:response.status,code:Number.isSafeInteger(data.error?.code)?data.error.code:null,subcode:Number.isSafeInteger(data.error?.error_subcode)?data.error.error_subcode:null};continue;}
      if(!Array.isArray(data.data)||data.data.length>20)throw Error('INVALID_TEMPLATE_LIST');
      const matches=data.data.filter(template=>template?.name===name&&template.language==='es_CO');
      if(matches.length!==1){state[kind]=matches.length>1?'AMBIGUOUS_TEMPLATE':data.paging?.next?'PAGINATION_REQUIRED':'NOT_FOUND';continue;}
      const template=matches[0];
      state[kind]=version&&!validateReferenceTemplate(template,version)?'CONTENT_MISMATCH':STATES.has(template.status)?template.status:'UNAVAILABLE';
    }catch{state[kind+'Diagnostic']={failure:'TEMPLATE_CHECK_UNCONFIRMED'};}
  }
  Object.assign(state,await verifyPinnedReferenceLogo(fetcher,{now}));
  const selected=selectTemplate(state,now());
  state.reference=selected?'APPROVED':state.referenceV2;
  state.selectedReference=selected?.name||null;
  state.ready=!!selected&&state.staff==='APPROVED';
  await env.NOVA_EVENTS.put(TEMPLATE_STATE_KEY,JSON.stringify(state));
  return state;
}

export async function templateHealth(env,{now=Date.now}={}) {
  const state=await env.NOVA_EVENTS?.get(TEMPLATE_STATE_KEY,'json');
  const selected=selectTemplate(state,now());
  return {version:'retail-reference-visual-v2',pilotActive:env.NOVA_RETAIL_ENABLED==='true',reference:selected?'APPROVED':state?.referenceV2||'NOT_CHECKED',referenceV1:state?.referenceV1||'NOT_CHECKED',referenceV2:state?.referenceV2||'NOT_CHECKED',staff:state?.staff||'NOT_CHECKED',ready:!!selected&&state?.staff==='APPROVED',checkedAt:state?.checkedAt||null,selectedReference:selected?.name||null,selectedVersion:selected?.version||null,headerReady:referenceHeaderReady(state,now()),headerUrl:selected?.version==='v2'?PINNED_LOGO_URL:null,headerSha256:state?.headerSha256||null,headerCheckedAt:state?.headerCheckedAt||null,referenceDiagnostic:state?.referenceV2Diagnostic||null,staffDiagnostic:state?.staffDiagnostic||null};
}

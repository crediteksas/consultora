import legacy from './quality-ui.mjs';
const OLD_GUARD="if(previous&&previous===current&&minutes<=30){reasons.push('Sofía repitió una pregunta');break;}";
const NEW_GUARD="if(previous&&previous===current&&minutes<=30&&isConversationQuestion(outgoing[i].contenido)){reasons.push('Sofía repitió una pregunta');break;}";
const QUESTION_HELPER=`function isConversationQuestion(value){
  const text=String(value||'');
  return /[?¿]/.test(text)||/^(?:me (?:confirmas|regalas|indicas|compartes|dices|envias)|(?:puedes|podrias) (?:confirmar|compartir|indicar|enviar|decir|regalar)(?:me)?|cual(?:es)? (?:es|son)|en que (?:ciudad|municipio)|a que (?:celular|numero)|que (?:marca|modelo|equipo))(?:\\s|$)/.test(normalizeConversationText(text));
}
`;
function patchQuestionAlert(html){
  const anchor='function interventionReasons(messages,client){';
  if(html.split(OLD_GUARD).length!==2||html.split(anchor).length!==2) return null;
  return html.replace(anchor,QUESTION_HELPER+anchor).replace(OLD_GUARD,NEW_GUARD);
}

const TARGETS=new Set(['/creditek/agentes/creditek-agente-respuestas','/creditek/agentes/creditek-agente-respuestas.html']);
const MAX_HTML_BYTES=262144;
async function boundedText(response){
  const reader=response.body?.getReader();
  if(!reader)return null;
  const decoder=new TextDecoder();let total=0,result='';
  try{
    while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_HTML_BYTES){void reader.cancel().catch(()=>{});return null;}result+=decoder.decode(value,{stream:true});}
    return result+decoder.decode();
  }finally{reader.releaseLock();}
}
function questionAlertOverlay(legacy){
  return {...legacy,async fetch(request,env,ctx){
    const response=await legacy.fetch(request,env,ctx);
    if(request.method!=='GET'||!TARGETS.has(new URL(request.url).pathname)||!response.ok||!response.headers.get('content-type')?.includes('text/html'))return response;
    const text=await boundedText(response.clone());
    const patched=text===null?null:patchQuestionAlert(text);
    if(patched===null)return response;
    const headers=new Headers(response.headers);
    for(const name of ['etag','content-length','last-modified','content-encoding'])headers.delete(name);
    headers.set('cache-control','no-store');headers.set('x-sofia-intervention-rule','questions-only-20261030');
    return new Response(patched,{status:response.status,statusText:response.statusText,headers});
  }};
}

export default questionAlertOverlay(legacy);

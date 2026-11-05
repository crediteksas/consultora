import legacy from './intervention-ui.mjs';
const OLD_LOAD="async function loadAll(){hideSofiaServiceUnavailable();await loadTiendas();await Promise.all([loadStats(),loadConvs(),loadClients()]);recomputeInterventions();applyFilters()}";
const NEW_LOAD="async function loadAll(){hideSofiaServiceUnavailable();await loadTiendas();await Promise.all([loadStats(),loadConvs(),loadClients()]);recomputeInterventions();applyFilters();refreshOpenChat()}";
const OPEN_ANCHOR="function openChat(tel){";
const SCROLL_ANCHOR="  setTimeout(()=>{const cm=document.getElementById('chat-msgs-inner');if(cm)cm.scrollTop=cm.scrollHeight;},50);";
const HELPER="const renderedChatMessages=new WeakMap();\nfunction escapeChatText(value){\n  return String(value??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));\n}\nfunction chatMessagesHtml(messages){\n  return [...(messages||[])].reverse().map(m=>{\n    const t=new Date(m.timestamp).toLocaleString('es-CO',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short'});\n    const isIn=m.direccion==='entrada';\n    const intentTag=m.intent?'<div class=\"msg-intent\">'+escapeChatText(m.intent)+'</div>':'';\n    return '<div class=\"msg '+(isIn?'msg-in':'msg-out')+'\"><div>'+escapeChatText(m.contenido||'')+'</div><div class=\"msg-meta\">'+(isIn?'Cliente':'Sofia')+' · '+t+'</div>'+intentTag+'</div>';\n  }).join('');\n}\nfunction rememberChatMessages(container,html){\n  if(container)renderedChatMessages.set(container,html);\n}\nfunction refreshOpenChat(){\n  const container=document.getElementById('chat-msgs-inner');\n  if(!currentTel||!container||!Array.isArray(grouped[currentTel]))return;\n  const html=chatMessagesHtml(grouped[currentTel]);\n  if(renderedChatMessages.get(container)===html)return;\n  const oldTop=container.scrollTop;\n  const followLatest=container.scrollHeight-container.clientHeight-oldTop<=80;\n  container.innerHTML=html;\n  rememberChatMessages(container,html);\n  container.scrollTop=followLatest?container.scrollHeight:oldTop;\n}\n";
const OLD_RENDER="  const msgsHtml=[...msgs].reverse().map(m=>{\n    const t=new Date(m.timestamp).toLocaleString('es-CO',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short'});\n    const isIn=m.direccion==='entrada';\n    const intentTag=m.intent?'<div class=\"msg-intent\">'+m.intent+'</div>':'';\n    return '<div class=\"msg '+(isIn?'msg-in':'msg-out')+'\"><div>'+(m.contenido||'')+'</div><div class=\"msg-meta\">'+(isIn?'Cliente':'Sofia')+' · '+t+'</div>'+intentTag+'</div>'\n  }).join('');";
function patchLiveChat(html){
  for(const anchor of [OLD_LOAD,OPEN_ANCHOR,OLD_RENDER,SCROLL_ANCHOR])if(html.split(anchor).length!==2)return null;
  return html.replace(OLD_LOAD,NEW_LOAD).replace(OPEN_ANCHOR,HELPER+'\n'+OPEN_ANCHOR).replace(OLD_RENDER,'  const msgsHtml=chatMessagesHtml(msgs);').replace(SCROLL_ANCHOR,"  rememberChatMessages(document.getElementById('chat-msgs-inner'),msgsHtml);\n"+SCROLL_ANCHOR);
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
function liveChatOverlay(legacy){
  return {...legacy,async fetch(request,env,ctx){
    const response=await legacy.fetch(request,env,ctx);
    if(request.method!=='GET'||!TARGETS.has(new URL(request.url).pathname)||!response.ok||!response.headers.get('content-type')?.includes('text/html'))return response;
    const text=await boundedText(response.clone());
    const patched=text===null?null:patchLiveChat(text);
    if(patched===null)return response;
    const headers=new Headers(response.headers);
    for(const name of ['etag','content-length','last-modified','content-encoding'])headers.delete(name);
    headers.set('cache-control','no-store');headers.set('x-sofia-live-chat','20261030-1');
    return new Response(patched,{status:response.status,statusText:response.statusText,headers});
  }};
}

export default liveChatOverlay(legacy);

import {patchLiveChat} from './policy.mjs';
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
export function liveChatOverlay(legacy){
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

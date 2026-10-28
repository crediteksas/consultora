// The parent entry already passes through the Worker. Assets remain byte-preserved.
export function approvedEntryOverlay(legacy, visual, dictation) {
 const page='/creditek/agentes/sofia-conversaciones-20261028';
 const original='/creditek/agentes/creditek-agente-respuestas';
 const microphone='/creditek/agentes/aura-dictation-off-20261028.mjs';
 return {...legacy,async fetch(request,env,ctx){
  const url=new URL(request.url),path=url.pathname;
  if(path===page&&['GET','HEAD'].includes(request.method)){
   url.pathname=original;
   const mapped=new Request(url,request);
   if(request.method==='GET')return visual.fetch(mapped,env,ctx);
   return legacy.fetch(mapped,env,ctx);
  }
  if(path===microphone&&['GET','HEAD'].includes(request.method)){
   url.pathname='/creditek/agentes/aura-dictation.mjs';
   return dictation.fetch(new Request(url,request),env,ctx);
  }
  const response=await legacy.fetch(request,env,ctx);
  if(request.method!=='GET'||!['/creditek/agentes/','/creditek/agentes/index.html'].includes(path)||!response.ok||!response.headers.get('content-type')?.includes('text/html'))return response;
  const body=await response.text();
  const fixed=body.replaceAll('/creditek/agentes/creditek-agente-respuestas.html',page).replaceAll('aura-dictation.mjs','aura-dictation-off-20261028.mjs');
  const headers=new Headers(response.headers);for(const name of ['etag','content-length','last-modified','content-encoding'])headers.delete(name);
  headers.set('cache-control','no-store');headers.set('x-aura-sofia-ui','20261028-2');
  return new Response(fixed,{status:response.status,statusText:response.statusText,headers});
 }};
}

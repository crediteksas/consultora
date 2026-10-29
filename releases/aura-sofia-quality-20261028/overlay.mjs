const QUALITY_ROOT='/creditek/agentes/sofia-calidad';
const ACTION_METHODS={status:'GET',preview:'POST',propose:'POST',approve:'POST',reject:'POST',revoke:'POST',restore:'POST',budget:'POST'};
const UPSTREAM='https://creditek-bot.comercial-853.workers.dev';
function qualityJson(body,status){return Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});}
export async function proxyQuality(request,fetcher=fetch){
 const url=new URL(request.url),action=url.pathname.slice((QUALITY_ROOT+'/api/').length);
 if(!Object.hasOwn(ACTION_METHODS,action))return qualityJson({ok:false,code:'invalid_action'},404);
 if(request.method!==ACTION_METHODS[action])return qualityJson({ok:false,code:'method_not_allowed'},405);
 const origin=request.headers.get('origin');
 if(origin&&origin!==url.origin)return qualityJson({ok:false,code:'invalid_origin'},403);
 const authorization=request.headers.get('authorization')||'';
 if(!/^Bearer \S+$/.test(authorization))return qualityJson({ok:false,code:'unauthorized'},401);
 let body;
 if(request.method==='POST'){
  if(!request.headers.get('content-type')?.startsWith('application/json'))return qualityJson({ok:false,code:'json_required'},415);
  if(Number(request.headers.get('content-length')||0)>4096)return qualityJson({ok:false,code:'body_too_large'},413);
  let size=0;const parts=[],reader=request.body?.getReader();
  if(reader)while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>4096){await reader.cancel();return qualityJson({ok:false,code:'body_too_large'},413);}parts.push(part.value);}
  body=new Uint8Array(size);let offset=0;for(const part of parts){body.set(part,offset);offset+=part.length;}
 }
 try{
  const upstream=await fetcher(UPSTREAM+'/api/sofia/quality/'+action,{method:request.method,headers:{authorization,accept:'application/json',origin:url.origin,...(body?{'content-type':'application/json'}:{})},...(body?{body}:{}),redirect:'manual',signal:AbortSignal.timeout(10000)});
  if((upstream.status>=300&&upstream.status<400)||!upstream.headers.get('content-type')?.includes('application/json'))return qualityJson({ok:false,code:'control_unavailable'},502);
  return new Response(upstream.body,{status:upstream.status,headers:{'cache-control':'no-store','content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff'}});
 }catch{return qualityJson({ok:false,code:'control_unavailable'},503);}
}
export function auraQualityOverlay(legacy,{html,css,client}){
 return {...legacy,async fetch(request,env,ctx){
  const path=new URL(request.url).pathname;
  if(path.startsWith(QUALITY_ROOT+'/api/'))return proxyQuality(request);
  if(path===QUALITY_ROOT){
   if(request.method!=='GET')return qualityJson({ok:false,code:'method_not_allowed'},405);
   return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'same-origin','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",'x-sofia-quality-aura':'20261028-1'}});
  }
  const response=await legacy.fetch(request,env,ctx);
  if(!['/creditek/agentes/creditek-agente-respuestas','/creditek/agentes/creditek-agente-respuestas.html'].includes(path)||request.method!=='GET'||!response.ok||!response.headers.get('content-type')?.includes('text/html'))return response;
  const headers=new Headers(response.headers);for(const key of ['content-length','content-encoding','etag','last-modified'])headers.delete(key);headers.set('cache-control','no-store');headers.set('x-sofia-quality-aura','20261028-1');
  return new HTMLRewriter()
   .on('head',{element(e){e.append('<style id="aura-sofia-quality-style">'+css+'</style>',{html:true});}})
   .on('.sidebar-tab',{element(e){if(e.getAttribute('onclick')==="switchView('correcciones',this)")e.setAttribute('onclick','auraOpenSofiaQuality()');}})
   .on('body',{element(e){e.append('<script id="aura-sofia-quality-client">'+client+'</script>',{html:true});}})
   .transform(new Response(response.body,{status:response.status,statusText:response.statusText,headers}));
 }};
}

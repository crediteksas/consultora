export function chatFitOverlay(legacy,css) {
  return {...legacy,async fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    const target=['/creditek/agentes/creditek-agente-respuestas','/creditek/agentes/creditek-agente-respuestas.html'].includes(path);
    const response=await legacy.fetch(request,env,ctx);
    if(!target||request.method!=='GET'||!response.ok||!response.headers.get('content-type')?.includes('text/html'))return response;
    const headers=new Headers(response.headers);
    for(const name of ['etag','content-length','last-modified','content-encoding'])headers.delete(name);
    headers.set('cache-control','no-store');headers.set('x-sofia-chat-fit','20261028-1');
    return new HTMLRewriter().on('head',{element(e){
      e.append('<style id="sofia-chat-fit-20261028">'+css+'</style>',{html:true});
    }}).transform(new Response(response.body,{status:response.status,statusText:response.statusText,headers}));
  }};
}

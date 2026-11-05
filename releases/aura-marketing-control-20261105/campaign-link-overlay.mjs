export function campaignLinkOverlay(legacy) {
 return {...legacy,async fetch(request,env,ctx){
  const response=await legacy.fetch(request,env,ctx);
  const path=new URL(request.url).pathname;
  if(request.method!=='GET'||!['/creditek/agentes/agente3-meta-ads.html','/creditek/agentes/agente3-meta-ads'].includes(path)||!response.ok||!response.headers.get('content-type')?.includes('text/html'))return response;
  const headers=new Headers(response.headers);
  for(const name of ['content-length','content-encoding','etag','last-modified'])headers.delete(name);
  headers.set('cache-control','no-store');
  let inserted=false;
  const rewriter=new HTMLRewriter().on('.header-right', {element(element){if(inserted)return;inserted=true;element.append('<a href="/creditek/agentes/aura-marketing-control.html" style="display:inline-block;padding:10px 14px;border-radius:10px;background:#0f223f;color:white;text-decoration:none">Control de resultados</a>',{html:true});}});
  return rewriter.transform(new Response(response.body,{status:response.status,statusText:response.statusText,headers}));
 }};
}

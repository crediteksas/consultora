import legacy from './visibility-ui.mjs';
function chatFitOverlay(legacy,css) {
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

export default chatFitOverlay(legacy,"/* Fit the conversation to its actual flex space, including embedded AURA. */\nbody[data-aura-page=\"sofia\"] .main { flex:1 1 0; min-height:0; }\nbody[data-aura-page=\"sofia\"] .center-panel { min-height:0; overflow:hidden; }\nbody[data-aura-page=\"sofia\"] #chat-area {\n  display:flex; flex-direction:column; flex:1 1 0;\n  min-width:0; min-height:0; overflow:hidden;\n}\nbody[data-aura-page=\"sofia\"] #chat-msgs-inner {\n  flex:1 1 0; min-height:0; max-height:none !important;\n  overflow-y:auto; overflow-x:hidden; overscroll-behavior:contain;\n}\nbody[data-aura-page=\"sofia\"] .msg { flex-shrink:0; overflow-wrap:anywhere; }\nbody[data-aura-page=\"sofia\"] .chat-header,\nbody[data-aura-page=\"sofia\"] .attention-box,\nbody[data-aura-page=\"sofia\"] .chat-reply,\nbody[data-aura-page=\"sofia\"] .chat-reply-disabled { flex-shrink:0; }\nbody[data-aura-page=\"sofia\"] .conv-scroll { min-height:0; overscroll-behavior:contain; }\nbody[data-aura-page=\"sofia\"] .reply-input { min-width:0; }\nbody[data-aura-page=\"sofia\"] .chat-header { flex-wrap:wrap; gap:8px; }\n@media (max-width:47.999rem) {\n  body[data-aura-page=\"sofia\"] .chat-header { padding:8px 12px; }\n  body[data-aura-page=\"sofia\"] .attention-box { margin:8px 12px 0; padding:6px 8px; }\n  body[data-aura-page=\"sofia\"] #chat-msgs-inner { padding:10px 12px; }\n  body[data-aura-page=\"sofia\"] .chat-reply,\n  body[data-aura-page=\"sofia\"] .chat-reply-disabled { padding:8px 12px; }\n}\n");

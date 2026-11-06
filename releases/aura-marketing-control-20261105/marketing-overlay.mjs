// A proposed read-only overlay. The original Worker and original ASSETS stay in place.
// Deployment must explicitly preserve existing assets and bindings after review.
export function marketingOverlay(legacy,assets){
 const allowed=new Set(['agente3-meta-ads.html','agente3-meta-ads','aura-marketing-control.html','aura-marketing-control','live-view.mjs','dashboard-client-v2.mjs','marketing-metrics.mjs','publication-tracking-client.mjs','publication-tracking-view.mjs','meta-existing-view.mjs'].map(p=>'/creditek/agentes/'+p));
 for(const key of Object.keys(assets))if(!allowed.has(key))throw Error('Unexpected marketing route');
 return{...legacy,async fetch(request,env,ctx){const p=new URL(request.url).pathname;if(['GET','HEAD'].includes(request.method)&&Object.hasOwn(assets,p)){const a=assets[p];return new Response(request.method==='HEAD'?null:a.body,{headers:{'content-type':a.type,'cache-control':'no-store','x-content-type-options':'nosniff'}})}return legacy.fetch(request,env,ctx)}};
}

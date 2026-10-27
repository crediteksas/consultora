import current,{NovaWebhookGateway as ExistingGateway,retailReferenceInvitation} from './nova-base.mjs';
import {prepareTemplates,templateHealth} from './meta-preflight.mjs';
import {createRetailRuntime} from './retail-runtime.mjs';
import portal from './retail-portal.mjs';
export * from './nova-base.mjs';
const retail=createRetailRuntime({makeInvitation:retailReferenceInvitation});
const html=(request)=>new Response(request.method==='HEAD'?null:portal,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"frame-ancestors 'self' https://aura.crediteksas.com https://registro.crediteksas.com",'x-nova-retail-release':'retail-20261020-v1'}});
async function checkpoint(env){
 let stage='kora';
 try{await retail.db(env,'kora','nova_retail_cases?select=source_id&limit=1');stage='aura';await retail.db(env,'aura','nova_retail_reference_dispatch?select=reference_id&limit=1');await env.NOVA_EVENTS.put('nova:retail:readiness:v1',JSON.stringify({schemaReady:true,checkedAt:Date.now()}));}
 catch(e){await env.NOVA_EVENTS.put('nova:retail:readiness:v1',JSON.stringify({schemaReady:false,stage,http:e.http||null,code:e.code||null,error:e.message==='DATABASE_NOT_CONFIGURED'?'DATABASE_NOT_CONFIGURED':'DATABASE_UNAVAILABLE',checkedAt:Date.now()}));}
}
export class NovaWebhookGateway extends ExistingGateway{
 async fetch(request){const copy=request.clone();const response=await super.fetch(request);if(response.ok&&this.env.NOVA_RETAIL_ENABLED==='true'){try{await retail.statuses(copy,this.env);}catch{return new Response('Delivery receipt pending',{status:503});}this.ctx.waitUntil(retail.reconcile(this.env).then(()=>retail.sendNotices(this.env)).catch(()=>{}));}return response;}
}
export default {...current,async fetch(request,env,ctx){
 const u=new URL(request.url);
 if(u.pathname==='/pilot/retail-health'&&request.method==='GET')return Response.json({...await templateHealth(env),readiness:await env.NOVA_EVENTS?.get('nova:retail:readiness:v1','json')||null},{headers:{'cache-control':'no-store'}});
 if(u.pathname==='/pilot/retail-preview'&&['GET','HEAD'].includes(request.method))return html(request);
 if(u.pathname==='/api/retail'){const r=await retail.api(request,env);if(r.ok&&request.method==='POST')ctx.waitUntil(retail.sendNotices(env).catch(()=>{}));return r;}
 if(env.NOVA_RETAIL_ENABLED==='true'&&u.searchParams.get('legacy')!=='1'&&['/creditek/agentes/nova-supervision.html','/pilot/retail','/nova/piloto'].includes(u.pathname)&&['GET','HEAD'].includes(request.method))return html(request);
 const watch=request.method==='POST'&&['/pilot/webhook','/internal/registration-intake'].includes(u.pathname),copy=watch?request.clone():null;
 const response=await current.fetch(request,env,ctx);
 if(response.ok&&env.NOVA_RETAIL_ENABLED==='true'){
  if(u.pathname==='/pilot/webhook'&&copy){try{await retail.statuses(copy,env);}catch{return new Response('Delivery receipt pending',{status:503});}ctx.waitUntil(retail.reconcile(env).then(()=>retail.sendNotices(env)).catch(()=>{}));}
  if(u.pathname==='/internal/registration-intake'&&copy)ctx.waitUntil((async()=>{const s=await copy.json();if(typeof s.solicitud_id==='string'){await retail.reconcileOne(env,s.solicitud_id);await retail.sendReferences(env,s.solicitud_id);await retail.sendNotices(env);}})().catch(()=>{}));
 }
 return response;
},async scheduled(event,env,ctx){
 await prepareTemplates(env);await checkpoint(env);await current.scheduled?.(event,env,ctx);
 if(env.NOVA_RETAIL_ENABLED==='true'){await retail.repairReplacements(env);await retail.reconcile(env);await retail.sendReferences(env);await retail.sendNotices(env);}
}};

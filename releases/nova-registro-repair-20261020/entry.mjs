import {WorkerEntrypoint} from 'cloudflare:workers';
import current from './current.mjs';
import registration,{dispatchRetailRegistrations} from './registration.mjs';
import{registrationGateway}from './gateway.mjs';
import{retailDatabaseGateway}from '../nova-retail-20261020/database-gateway.mjs';
export * from './current.mjs';
export class AuraRegistrationGateway extends WorkerEntrypoint{
 async fetch(request){return registrationGateway(request,this.env,registration);}
}
export class NovaRetailDatabaseGateway extends WorkerEntrypoint{async fetch(request){return retailDatabaseGateway(request,this.env);}}
export function useRegistration(path){return path==='/nova/registro'||path.startsWith('/nova/registro-')||path==='/api/registro'||path.startsWith('/api/registro/')||['/api/otp/enviar','/api/otp/verificar','/api/documentos','/api/subir-cedula','/api/admin/origenes-enlaces','/api/admin/enlaces','/internal/nova-reference-source','/internal/kpis/inscritos'].includes(path)||/^\/api\/admin\/enlaces\/[0-9a-f-]+\/revocar$/i.test(path)||/^\/creditek\/erp\/registro(?:\.html|\/)?$/.test(path);}
export default {...current,
 async fetch(request,env,ctx){const path=new URL(request.url).pathname;const r=await(useRegistration(path)?registration:current).fetch(request,env,ctx);if(path==='/api/documentos'&&request.method==='POST'&&r.ok&&env.NOVA_RETAIL_ENABLED==='true')ctx.waitUntil(dispatchRetailRegistrations(env));return r;},
 scheduled(event,env,ctx){return(event.cron==='*/5 * * * *'?registration:current).scheduled(event,env,ctx);}
};

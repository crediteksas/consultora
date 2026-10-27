import {authenticateAuraRegistrationLinks} from './auth.mjs';
const reply=(error,status)=>Response.json({ok:false,error},{status,headers:{'cache-control':'no-store'}});
export async function registrationGateway(request,env,registration,authenticate=authenticateAuraRegistrationLinks){
 const u=new URL(request.url);let method,path;
 if(u.search)return reply('Ruta no encontrada',404);
 if(u.pathname==='/api/aura/enlaces/origenes'){method='GET';path='/api/admin/origenes-enlaces';}
 else if(u.pathname==='/api/aura/enlaces'){method='POST';path='/api/admin/enlaces';}
 else {const m=u.pathname.match(/^\/api\/aura\/enlaces\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/revocar$/i);if(m){method='POST';path='/api/admin/enlaces/'+m[1]+'/revocar';}}
 if(!path)return reply('Ruta no encontrada',404);
 if(request.method!==method)return reply('Método no permitido',405);
 if(!await authenticate(request))return reply('No autorizado',403);
 if(!env.ADMIN_ENLACES_TOKEN)return reply('Servicio no configurado',503);
 let body;
 if(method==='POST'){
  if(Number(request.headers.get('content-length'))>4096)return reply('Solicitud demasiado grande',413);
  const reader=request.body?.getReader();let size=0;const chunks=[];
  if(reader)try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return reply('Solicitud demasiado grande',413);}chunks.push(value);}}finally{reader.releaseLock();}
  const joined=new Uint8Array(size);let i=0;for(const c of chunks){joined.set(c,i);i+=c.length;}body=size?joined:'{}';
 }
 const forwarded=new Request('https://registration.internal'+path,{method,headers:{authorization:'Bearer '+env.ADMIN_ENLACES_TOKEN,'content-type':'application/json'},...(body!==undefined?{body}:{})});
 const response=await registration.fetch(forwarded,env);
 const h=new Headers(response.headers);h.set('cache-control','no-store');h.delete('set-cookie');return new Response(response.body,{status:response.status,headers:h});
}

import {applyLiquidHtml,isAuraPresentationPath} from './presentation.mjs';
const MAX_HTML_BYTES=524288;
async function boundedHtml(response){
 const reader=response.body?.getReader();if(!reader)return null;
 const decoder=new TextDecoder();let bytes=0,text='';
 try{while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>MAX_HTML_BYTES){void reader.cancel().catch(()=>{});return null;}text+=decoder.decode(next.value,{stream:true});}return text+decoder.decode();}
 finally{reader.releaseLock();}
}
export function auraLiquidOverlay(legacy,css){
 const prototype=legacy&&Object.getPrototypeOf(legacy);
 if(!legacy||typeof legacy!=='object'||(prototype!==Object.prototype&&prototype!==null))throw Error('Visual overlay requires a plain-object entrypoint; separate review required');
 const descriptors=Object.getOwnPropertyDescriptors(legacy);
 for(const key of Reflect.ownKeys(descriptors)){
  const property=descriptors[key];
  if(typeof key!=='string')throw Error('Symbol exports require separate adapter review');
  if(!property.enumerable)throw Error('Non-enumerable exports require separate adapter review');
  if(property.get||property.set)throw Error('Accessor exports require separate adapter review');
 }
 if(typeof legacy.fetch!=='function')throw Error('Visual overlay requires an existing fetch handler');
 const forwarded={};
 // Finite integration contract: preserve every existing own function, including
 // new platform handlers such as tailStream, without exposing prototype RPC.
 for(const [name,value] of Object.entries(legacy)){
  if(name!=='fetch'&&typeof value==='function')forwarded[name]=value.bind(legacy);
 }
 let etagPromise;
 const cssEtag=()=>etagPromise??=(async()=>{
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(css));
  return '"'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')+'"';
 })();
 return {...legacy,...forwarded,async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.hostname==='aura.crediteksas.com' && url.pathname==='/creditek/agentes/creditek-liquid.css' && ['GET','HEAD'].includes(request.method)){
   const etag=await cssEtag(),headers={'content-type':'text/css;charset=utf-8','cache-control':'public, max-age=0, must-revalidate','x-content-type-options':'nosniff',etag};
   const matches=(request.headers.get('if-none-match')||'').split(',').map(value=>value.trim().replace(/^W\//,''));
   if(matches.includes(etag)||matches.includes('*'))return new Response(null,{status:304,headers});
   return new Response(request.method==='HEAD'?null:css,{headers});
  }
  const response=await legacy.fetch(request,env,ctx);
  if(url.hostname!=='aura.crediteksas.com'||request.method!=='GET'||!isAuraPresentationPath(url.pathname)||response.status!==200||!response.headers.get('content-type')?.toLowerCase().startsWith('text/html'))return response;
  // Bounded clone: on unknown HTML, oversize or a duplicate, return the untouched response.
  let result;
  try { const html=await boundedHtml(response.clone());result=html===null?null:applyLiquidHtml(html); } catch { return response; }
  if(result===null)return response;
  const headers=new Headers(response.headers);
  for(const name of ['content-length','content-encoding','etag','last-modified'])headers.delete(name);
  headers.set('cache-control','no-store');headers.set('x-creditek-visual','liquid-1');
  return new Response(result,{status:response.status,statusText:response.statusText,headers});
 }};
}

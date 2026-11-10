// Local candidate: exact frozen predecessor is imported without rewriting it.
import baseline from './baseline/registro-alo.mjs';
import {serveFFmpegAsset} from '../../creditek/convenios/video-codec/asset-routes.mjs';
import {patchAliadosVideoHtml} from './worker-form-transform.mjs';
import {PENDING_SCRIPT} from './pending-script.generated.mjs';
export default {
 async fetch(request,env,ctx){
  const codec=await serveFFmpegAsset(request);if(codec)return codec;
  const response=await baseline.fetch(request,env,ctx),path=new URL(request.url).pathname;
  if(request.method==='GET'&&path==='/creditek/convenios/pendientes/app.js'&&response.ok){
   await response.body?.cancel();const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');
   return new Response(PENDING_SCRIPT,{status:response.status,headers});
  }
  if(request.method==='GET'&&/^\/creditek\/convenios(?:\/|\/index\.html)?$/.test(path)&&response.ok){
   const html=patchAliadosVideoHtml(await response.text()),headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store');headers.set('x-ally-video','mp4-20261029');return new Response(html,{status:response.status,headers});
  }
  return response;
 }
};

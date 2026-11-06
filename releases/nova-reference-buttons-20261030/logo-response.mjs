import logo from './logo-base64.mjs';
import {PINNED_LOGO_SHA256} from './meta-preflight.mjs';
export function referenceLogoResponse(request) {
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{allow:'GET, HEAD'}});
  return new Response(request.method==='HEAD'?null:Uint8Array.from(atob(logo),c=>c.charCodeAt(0)),{headers:{'content-type':'image/png','cache-control':'public, max-age=3600','x-content-type-options':'nosniff',etag:'"'+PINNED_LOGO_SHA256+'"'}});
}

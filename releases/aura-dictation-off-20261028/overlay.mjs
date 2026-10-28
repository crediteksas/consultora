// Oscar requested disabling the floating dictation feature. Microphone permissions are untouched.
export function withoutAuraDictation(legacy) {
 const disabled='export function installDictation(){return false;}\nexport function insertTranscript(value,start,end){return {value,cursor:start};}\n';
 return {...legacy,async fetch(request,env,ctx){
  if(new URL(request.url).pathname==='/creditek/agentes/aura-dictation.mjs'&&['GET','HEAD'].includes(request.method))return new Response(request.method==='HEAD'?null:disabled,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store','x-aura-dictation':'disabled','x-content-type-options':'nosniff'}});
  return legacy.fetch(request,env,ctx);
 }};
}

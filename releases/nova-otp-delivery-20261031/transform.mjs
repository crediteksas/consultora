import {createHash} from 'node:crypto';
import fs from 'node:fs';
export const CLIENT_BASE='97cc1e52d59e78d077b947b2ec24ac0960200021bb8ae830922fdc081b65c772';
export const NOVA_BASE='3dc0b1d578bc5ebacccaae63310f8b11ca71c3e9a5a36b5e731f6a76a01ae355';
export const sha=x=>createHash('sha256').update(x).digest('hex');
const read=n=>fs.readFileSync(new URL(n,import.meta.url),'utf8');
function once(s,a,b){if(s.split(a).length!==2)throw Error('DELIVERY_ANCHOR_DRIFT:'+a.slice(0,70));return s.replace(a,b);}
function inline(n){return read('server/'+n).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');}
const common=()=>inline('common.mjs');
export function transformClient(source,form){
 if(sha(source)!==CLIENT_BASE)throw Error('CLIENT_BASELINE_DRIFT');
 // All added helpers have module-local names isolated from the existing bundle.
 const commonSource=common();
 let next=source;
 const a=next.indexOf('async function sendSecureOtp2('),b=next.indexOf('\n__name(sendSecureOtp2,',a);
 if(a<0||b<=a)throw Error('SEND_FUNCTION_DRIFT');
 let send=next.slice(a,b);
 send=once(send,'  const active = await novaActiveOtp2(input, resolved.enlaceId, env22222, dependencies.fetcher, now);',`  try{await novaClientOtpDelivery.read(input,resolved.enlaceId,env22222);}catch{return result4(503,"No se pudo preparar el seguimiento del código. Tus datos y fotos se conservan.");}
  if(!env22222.NOVA_REGISTRATION?.fetch||!env22222.NOVA_REGISTRATION_INTAKE_TOKEN)return result4(503,"El seguimiento de WhatsApp no está disponible.");
  const active = await novaActiveOtp2(input, resolved.enlaceId, env22222, dependencies.fetcher, now);`);
 send=once(send,'if (active.row) return novaActiveOtpReply2(active.row, now);','if (active.row) return novaExistingOtpResponse(input,resolved.enlaceId,active.row,env22222,now);');
 send=once(send,'if (current.row) return novaActiveOtpReply2(current.row, (dependencies.now ?? Date.now)());','if (current.row) return novaExistingOtpResponse(input,resolved.enlaceId,current.row,env22222,(dependencies.now ?? Date.now)());');
 const s=send.indexOf('  let sent = false;');if(s<0)throw Error('TRANSPORT_ANCHOR_DRIFT');
 send=send.slice(0,s)+`  const sent=await sendTrackedWhatsappOtp(input.celular,codigo,env22222,dependencies.fetcher);
  const retryAfter=Math.min(300,Math.max(0,Math.ceil((now+OTP_TTL_MS2-(dependencies.now??Date.now)())/1000)));
  if(sent.state==='failed'||sent.state==='not_sent'){
    const marked=await closeDelivery2(deliveryFilters2(input,resolved.enlaceId,reservation.otpId),'envio_fallido_at',new Date((dependencies.now??Date.now)()).toISOString(),reservation.otpId,env22222,dependencies.fetcher);
    return {status:marked?502:503,body:{ok:false,state:marked?'failed':'uncertain',attempt_id:reservation.otpId,retry_after:retryAfter,error:marked?'WhatsApp no aceptó el envío del código. Confirma que el celular sea correcto y tenga WhatsApp. Tus datos y fotos se conservan.':'No se pudo confirmar el envío. Tus datos y fotos se conservan.'}};
  }
  if(sent.state!=='accepted'||!await novaClientOtpDelivery.register(input,resolved.enlaceId,reservation.otpId,sent.providerMessageId,env22222))return {status:202,body:{ok:false,pending:true,state:'uncertain',attempt_id:reservation.otpId,retry_after:retryAfter,error:'No se pudo confirmar el envío del código. Conservamos tus datos y fotos. No enviamos otro automáticamente.'}};
  return {status:200,body:{ok:true,state:'accepted',attempt_id:reservation.otpId,delivery_confirmed:false,retry_after:retryAfter}};
}`;
 next=next.slice(0,a)+send+next.slice(b);
 const va=next.indexOf('async function verifySecureOtp2('),vb=next.indexOf('\n__name(verifySecureOtp2,',va);if(va<0||vb<=va)throw Error('VERIFY_ANCHOR_DRIFT');
 let verify=next.slice(va,vb);verify=once(verify,'  if (!resolved.ok) return resolved.response;','  if (!resolved.ok) return resolved.response;\n  const deliveryBlock=await novaVerifyDeliveryBeforeCode(input,resolved.enlaceId,env22222);\n  if(deliveryBlock)return deliveryBlock;');
 verify=once(verify,'  const bindingFilters = boundOtpFilters2(input, resolved.enlaceId, nowIso);','  const bindingFilters = {...boundOtpFilters2(input, resolved.enlaceId, nowIso),...(input.attempt_id?{id:"eq."+input.attempt_id}:{})};');
 next=next.slice(0,va)+verify+next.slice(vb);
 next=once(next,'      if (url.pathname === "/api/otp/enviar" && request.method === "POST") {\n        return respond(await handleOtpEnviarRoute2(request, env22222));','      if(url.pathname === "/api/otp/estado-whatsapp") return respond(await novaHandleWhatsappOtpStatus(request,env22222));\n      if (url.pathname === "/api/otp/enviar" && request.method === "POST") {\n        return respond(await handleOtpEnviarRoute2(request, env22222));');
 // Register the new public route in the existing gateway; the original CORS,
 // origin validation, link validation and fail-closed responses remain in force.
 next=once(next,'"/api/otp/enviar", "/api/otp/verificar", "/api/otp/opciones", "/api/otp/estado",','"/api/otp/enviar", "/api/otp/verificar", "/api/otp/opciones", "/api/otp/estado", "/api/otp/estado-whatsapp",');
 next=once(next,'var pilot_form_default = '+next.split('var pilot_form_default = ')[1].split('\n')[0],'var pilot_form_default = '+JSON.stringify(form)+';');
 return next+'\n// Exact-ID WhatsApp delivery projection; no automatic resends.\nconst {createClientOtpDelivery,publicDeliveryState,sendTrackedWhatsappOtp}=(()=>{\n'+commonSource+'\n'+inline('client-delivery.mjs')+'\n'+inline('send-whatsapp.mjs')+'\nreturn {createClientOtpDelivery,publicDeliveryState,sendTrackedWhatsappOtp};})();\n'+read('server/integration-client.js')+'\n';
}
export function transformNova(source){
 if(sha(source)!==NOVA_BASE)throw Error('NOVA_BASELINE_DRIFT');
 let next=once(source,'  if (u.pathname === "/branding/creditek-logo.png") return referenceLogoResponse(request);','  if(u.pathname === "/internal/client-otp-receipt") return novaOtpReceiptBridge(request,env);\n  if (u.pathname === "/branding/creditek-logo.png") return referenceLogoResponse(request);');
 return next+'\n// Authenticated exact-ID delivery lookup, using existing signed receipts only.\nconst novaOtpReceiptBridge=(()=>{\n'+common()+'\n'+inline('nova-receipt.mjs')+'\nreturn createNovaOtpReceiptBridge({equal:secretEqual2});})();\n';
}

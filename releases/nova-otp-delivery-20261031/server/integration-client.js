const novaClientOtpDelivery=createClientOtpDelivery({
 rpc:(name,body,env)=>rpc(name,body,env,smsOtpDependencies()),
 resolveContext:resolveContext2
});
async function novaExistingOtpResponse(input,enlaceId,active,env,clock){
 try{
  const row=await novaClientOtpDelivery.read(input,enlaceId,env);
  if(row.found&&row.otpId===active.id)return {status:row.state==='failed'?502:202,body:{...publicDeliveryState(row,clock),pending:row.state!=='failed'}};
 }catch{}
 return {status:202,body:{ok:false,pending:true,state:'uncertain',attempt_id:active.id,retry_after:Math.min(300,Math.max(0,Math.ceil((Date.parse(active.expira_at)-clock)/1000))),error:'No se pudo confirmar la entrega. Conservamos tus datos y fotos; no enviamos otro código automáticamente.'}};
}
async function novaVerifyDeliveryBeforeCode(input,enlaceId,env){
 if(input.attempt_id!==undefined&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.attempt_id))return {status:400,body:{ok:false,error:'Intento inválido.'}};
 try{
  const row=await novaClientOtpDelivery.read(input,enlaceId,env);
  return row.state==='failed'?{status:400,body:publicDeliveryState(row,Date.now())}:null;
 }catch{return {status:503,body:{ok:false,state:'uncertain',error:'No se pudo comprobar el estado del código. Tus datos y fotos se conservan.'}};}
}
async function novaHandleWhatsappOtpStatus(request,env){return novaClientOtpDelivery.handle(request,env);}

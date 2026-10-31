// BEGIN NOVA WHATSAPP DELIVERY UI 20261031.1
// Status reads never send, consume CAPTCHA, clear identity fields, or replace Files.
let legacyWaAttempt = null;
let legacyWaTimer = null;
let legacyWaSending = false;
const LEGACY_WA_MAX_MS = 300000;
const LEGACY_WA_STATES = new Set(['accepted','sent','delivered','read','failed','uncertain','expired','verified','not_found']);
const LEGACY_WA_ATTEMPT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function legacyWaCurrent(a) {
  return !!a && a === legacyWaAttempt && !smsOtpEnabled && !otpVerificado && repairSameIdentity(a);
}
function legacyWaSeconds(a=legacyWaAttempt) {
  return a ? Math.max(0, Math.ceil((a.lockUntil-Date.now())/1000)) : 0;
}
function legacyWaSendBlocked() {
  const a=legacyWaAttempt;
  return legacyWaSending || (!!a && repairSameIdentity(a) && (a.state==='verified' || legacyWaSeconds(a)>0));
}
function legacyWaVerificationBlocked() {
  const a=legacyWaAttempt;
  return !!a && repairSameIdentity(a) && (!['accepted','sent','delivered','read'].includes(a.state) || legacyWaSeconds(a)===0);
}
function legacyWaStopTimer() {
  if(legacyWaTimer!==null){clearTimeout(legacyWaTimer);legacyWaTimer=null;}
}
function legacyWaIdentityChanged() {
  if(legacyWaAttempt && !repairSameIdentity(legacyWaAttempt)){
    legacyWaStopTimer();legacyWaAttempt=null;
    if(!otpVerificado){codeRow.classList.remove('show');otpStatus.textContent='Verifica el celular actual. Tus datos y fotos se conservan.';}
  }
}
function legacyWaBegin(cedula,celular) {
  legacyWaStopTimer();
  const now=Date.now();
  legacyWaAttempt={cedula,celular,state:'uncertain',lockUntil:now+LEGACY_WA_MAX_MS,
    pollUntil:now+LEGACY_WA_MAX_MS,nextPollAt:now+1000,checking:false,errorCode:null,quotaLimited:false,attemptId:null};
  return legacyWaAttempt;
}
function legacyWaRender() {
  const a=legacyWaAttempt;
  if(!legacyWaCurrent(a) || repairVerificationBusy)return;
  const seconds=legacyWaSeconds(a);
  const next=seconds>0?' Podrás solicitar otro código en '+seconds+' s.':' Puedes solicitar otro código después de completar la verificación de seguridad.';
  let text;
  if(a.state==='failed'){
    text='WhatsApp no pudo entregar el código'+(a.errorCode==='131026'?' (error 131026)':'')+'. Comprueba que el celular sea tuyo y tenga WhatsApp activo. Puedes corregirlo sin perder tus datos ni tus fotos.'+next;
    otpStatus.className='otp-status err';codeRow.classList.remove('show');
  }else if(a.state==='verified'){
    text='Este código ya fue utilizado. Continúa en el formulario donde verificaste el celular.';
    otpStatus.className='otp-status pending';codeRow.classList.remove('show');
  }else if(a.quotaLimited&&a.state==='uncertain'){
    text='Alcanzaste el límite de solicitudes. No se enviará otro código automáticamente. Tus datos y fotos se conservan; vuelve a solicitarlo más tarde.';
    otpStatus.className='otp-status err';codeRow.classList.remove('show');
  }else if(a.state==='expired' || seconds===0){
    text='El código venció. Tus datos y fotos se conservan.'+next;
    otpStatus.className='otp-status err';codeRow.classList.remove('show');
  }else if(a.state==='delivered'||a.state==='read'){
    text='WhatsApp confirmó la entrega. Ingresa el código recibido; vence en '+seconds+' s.';
    otpStatus.className='otp-status pending';codeRow.classList.add('show');
  }else if(a.state==='accepted'||a.state==='sent'){
    text='WhatsApp aceptó el envío; todavía no confirmó la entrega. Si recibiste el código, ingrésalo. Vigencia restante: '+seconds+' s.';
    otpStatus.className='otp-status pending';codeRow.classList.add('show');
  }else{
    text='Todavía no se confirmó el resultado del envío. Conservamos tus datos y fotos; estamos comprobando su estado.'+next;
    otpStatus.className='otp-status pending';codeRow.classList.remove('show');
  }
  otpStatus.textContent=text;
  btnVerificarOtp.disabled=legacyWaVerificationBlocked();
  evaluarEnvioOtp();
}
function legacyWaApply(a,data) {
  if(!legacyWaCurrent(a)||repairVerificationBusy||!data||!LEGACY_WA_STATES.has(data.state))return false;
  const attemptId=typeof data.attempt_id==='string'&&LEGACY_WA_ATTEMPT_UUID.test(data.attempt_id)?data.attempt_id.toLowerCase():null;
  // Once the server identifies the attempt, another same-identity attempt is not its result.
  if(a.attemptId!==null && attemptId!==a.attemptId)return false;
  if(data.attempt_id!==undefined && attemptId===null)return false;
  if(a.attemptId===null && attemptId!==null)a.attemptId=attemptId;
  // A failed delivery is terminal for this exact attempt; stale acceptance cannot revive it.
  if(a.state==='failed'&&data.state!=='failed')return false;
  a.state=data.state==='not_found'?'uncertain':data.state;
  if(a.state!=='uncertain')a.quotaLimited=false;
  if(Number.isInteger(data.retry_after)&&data.retry_after>=0&&data.retry_after<=300){
    a.lockUntil=Math.min(a.lockUntil,a.pollUntil,Date.now()+data.retry_after*1000);
  }
  a.errorCode=data.error_code==='131026'?'131026':null;
  legacyWaRender();return true;
}
function legacyWaLocalUncertain(a){
  // A missing network response may change only this local hint; it never replaces the bound ID.
  if(!legacyWaCurrent(a)||repairVerificationBusy||['failed','expired','verified'].includes(a.state))return;
  a.state='uncertain';a.errorCode=null;legacyWaRender();
}
async function legacyWaPoll(a) {
  if(!legacyWaCurrent(a)||a.checking||repairVerificationBusy||legacyWaSending||Date.now()>=a.pollUntil||['failed','expired','verified'].includes(a.state))return;
  a.checking=true;
  try{
    const res=await fetch(API+'/api/otp/estado-whatsapp',{
      method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(8000),
      body:JSON.stringify({enlace_token:enlaceToken,cedula:a.cedula,celular:a.celular,...(a.attemptId?{attempt_id:a.attemptId}:{})}),
    });
    const data=await res.json().catch(()=>({}));
    if(!legacyWaCurrent(a)||repairVerificationBusy)return;
    if(res.status>=200&&res.status<300&&LEGACY_WA_STATES.has(data.state))legacyWaApply(a,data);
    else if(!['failed','expired','verified'].includes(a.state))legacyWaLocalUncertain(a);
  }catch{
    legacyWaLocalUncertain(a);
  }finally{a.checking=false;}
}
function legacyWaSchedule() {
  legacyWaStopTimer();
  const a=legacyWaAttempt;
  if(!legacyWaCurrent(a))return;
  if(Date.now()>=a.pollUntil || legacyWaSeconds(a)===0 || a.state==='verified'){legacyWaRender();return;}
  legacyWaTimer=setTimeout(async()=>{
    legacyWaTimer=null;
    if(!legacyWaCurrent(a))return;
    if(!repairVerificationBusy){
      if(Date.now()>=a.nextPollAt){a.nextPollAt=Date.now()+8000;await legacyWaPoll(a);}
      legacyWaRender();
    }
    legacyWaSchedule();
  },1000);
}
// END NOVA WHATSAPP DELIVERY UI 20261031.1

import {createHash} from 'node:crypto';
import fs from 'node:fs';

export const FORM_BASE_SHA256='ef6c89485e34b4b80f7df3e68f962c0ac66232d4a0e7ec8e3a06073554810b07';
const helper=fs.readFileSync(new URL('./legacy-wa-ui.js',import.meta.url),'utf8');
function once(source,anchor,replacement){
  if(source.split(anchor).length!==2)throw Error('UI_ANCHOR_DRIFT: '+anchor.slice(0,80));
  return source.replace(anchor,replacement);
}
const SEND_START="btnEnviarOtp.addEventListener('click', async () => {";
const SEND_END="\ncodigoOtpInput.addEventListener('input', (e) => {";
const sendHandler=`btnEnviarOtp.addEventListener('click', async () => {
  if(repairVerificationBusy||legacyWaSending)return;
  if(smsOtpEnabled)return solicitarOtpGestionado('whatsapp');
  const celular=celularInput.value,cedula=document.getElementById('cedula').value;
  legacyWaIdentityChanged();
  if(!contextoValido||!celularValido(celular)||!cedulaValida(cedula)||!turnstileToken||legacyWaSendBlocked()||otpVerificado)return;
  const ahora=Date.now();if(ahora-ultimoEnvioOtp<15000)return;ultimoEnvioOtp=ahora;
  otpLegacyStarted=true;legacyWaSending=true;
  const a=legacyWaBegin(cedula,celular);
  btnEnviarOtp.disabled=true;otpStatus.className='otp-status pending';otpStatus.textContent='Solicitando código por WhatsApp…';
  try{
    const res=await fetch(API+'/api/otp/enviar',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),
      body:JSON.stringify({enlace_token:enlaceToken,cedula,celular,turnstile_token:turnstileToken})});
    const data=await res.json().catch(()=>({}));
    if(!legacyWaCurrent(a))return;
    if(LEGACY_WA_STATES.has(data.state))legacyWaApply(a,data);
    else if(res.status===202&&data.pending===true)legacyWaApply(a,{state:'uncertain',retry_after:data.retry_after,attempt_id:data.attempt_id});
    else if(res.status===409&&data.reason==='active_challenge')legacyWaApply(a,{state:'uncertain',retry_after:data.retry_after,attempt_id:data.attempt_id});
    else if(res.ok&&data.ok===true)legacyWaApply(a,{state:'accepted',retry_after:300,attempt_id:data.attempt_id});
    else if(res.status===404){legacyWaStopTimer();legacyWaAttempt=null;mostrarBloqueoEnlace();}
    else if(res.status===429){a.quotaLimited=true;legacyWaApply(a,{state:'uncertain',retry_after:300});}
    else legacyWaApply(a,{state:'uncertain',retry_after:300});
  }catch{if(legacyWaCurrent(a))legacyWaApply(a,{state:'uncertain'});}
  finally{
    legacyWaSending=false;reiniciarTurnstile();
    if(legacyWaCurrent(a)){legacyWaRender();legacyWaSchedule();}
    evaluarEnvioOtp();
  }
});
`;

export function transformForm(base){
  if(createHash('sha256').update(base).digest('hex')!==FORM_BASE_SHA256)throw Error('FORM_BASELINE_DRIFT');
  let out=once(base,'function mostrarErrorOtp(mensaje) {',helper+'\nfunction mostrarErrorOtp(mensaje) {');
  out=once(out,"btnEnviarOtp.disabled = repairVerificationBusy ||\n    !contextoValido ||","btnEnviarOtp.disabled = repairVerificationBusy || otpVerificado || legacyWaSendBlocked() ||\n    !contextoValido ||");
  out=once(out,"celularInput.value = celularInput.value.replace(/\\D/g, '').slice(0, 10);\n  programarOpcionesOtp();","celularInput.value = celularInput.value.replace(/\\D/g, '').slice(0, 10);\n  legacyWaIdentityChanged();\n  programarOpcionesOtp();");
  out=once(out,"e.target.value = e.target.value.replace(/\\D/g, '').slice(0, 12);\n  if (otpVerificado", "e.target.value = e.target.value.replace(/\\D/g, '').slice(0, 12);\n  legacyWaIdentityChanged();\n  if (otpVerificado");
  const start=out.indexOf(SEND_START),end=out.indexOf(SEND_END,start);
  if(start<0||end<0||out.indexOf(SEND_START,start+1)!==-1)throw Error('UI_SEND_HANDLER_DRIFT');
  out=out.slice(0,start)+sendHandler+out.slice(end);
  out=once(out,"if(codigo.length!==6||repairVerificationBusy)return;\n  const otpVerifyManaged=smsOtpEnabled;", "if(codigo.length!==6||repairVerificationBusy||(!smsOtpEnabled&&legacyWaVerificationBlocked()))return;\n  const otpVerifyManaged=smsOtpEnabled;");
  out=once(out,"body:JSON.stringify({enlace_token:enlaceToken,cedula,celular,codigo})", "body:JSON.stringify({enlace_token:enlaceToken,cedula,celular,codigo,...(!otpVerifyManaged&&legacyWaAttempt?.attemptId?{attempt_id:legacyWaAttempt.attemptId}:{})})");
  out=once(out,"otpVerificado=true;celularVerificado=celular;cedulaVerificada=cedula;", "otpVerificado=true;celularVerificado=celular;cedulaVerificada=cedula;legacyWaStopTimer();");
  for(const match of out.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(match[1]);
  return out;
}

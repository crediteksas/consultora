import { createHash } from 'node:crypto';

export const FORM_BASE_SHA256 = '0f95fd3046df2e74b607a6f5dd9182c02048a5571e26a2689e73d72e61379c2e';

function once(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('NOVA_UI_ANCHOR_DRIFT: ' + before.slice(0, 70));
  return source.replace(before, after);
}
function block(source, start, end, replacement) {
  if (source.split(start).length !== 2 || source.split(end).length !== 2) throw new Error('NOVA_UI_BLOCK_DRIFT');
  const from = source.indexOf(start), to = source.indexOf(end, from);
  if (to < from) throw new Error('NOVA_UI_BLOCK_ORDER');
  return source.slice(0, from) + replacement + source.slice(to);
}

// Kept separate from the generated form so review/tests exercise the same code.
const repairHelpers = String.raw`
// BEGIN NOVA FLOW REPAIR 20261030.1
let repairVerificationBusy=false,repairNeedsAuth=false,repairRegistrationUncertain=false;
let repairPayloadMayRenew=false,repairRegistrationBlocked=false,repairPayloadIdentity=null;
let repairRecoveryPanel=null,repairRecoveryInfo=null,repairRecoverySave=null,repairResumeBusy=false;
let repairRecoveryIdentity=null,repairHadStoredRegistration=false;
const repairClockSkewSessions=new Set();
const repairNotice=document.createElement('section');repairNotice.hidden=true;repairNotice.setAttribute('role','status');
const repairMessage=document.createElement('p'),repairAuth=document.createElement('button'),repairCheck=document.createElement('button');
repairAuth.type='button';repairAuth.textContent='Verificar celular sin perder mis fotos';
repairCheck.type='button';repairCheck.textContent='Comprobar registro';
repairNotice.className='ref-block';repairMessage.style.cssText='margin:0 0 8px;font-size:14px';
for(const button of [repairAuth,repairCheck]){button.className='btn-secondary';button.style.cssText='min-height:44px;width:100%;padding:12px 16px;white-space:normal;margin-top:8px';}
repairNotice.append(repairMessage,repairAuth,repairCheck);form.before(repairNotice);
function repairShow(message,{auth=false,check=false}={}){
 repairNotice.hidden=false;repairMessage.textContent=message;repairAuth.hidden=!auth;repairCheck.hidden=!check;
}
function repairClearNotice(){repairNotice.hidden=true;repairAuth.hidden=true;repairCheck.hidden=true;}
function repairSameIdentity(identity){return identity.cedula===document.getElementById('cedula').value&&identity.celular===celularInput.value;}
// This untrusted read can only request reauthentication; the server still verifies the signature and context.
function repairSessionExp(session){try{const data=JSON.parse(atob(String(session).split('.')[0].replace(/-/g,'+').replace(/_/g,'/')));return Number.isFinite(data.exp)?data.exp:null;}catch{return null;}}
function repairMarkFreshSession(session){const exp=repairSessionExp(session);if(exp!==null&&exp<=Date.now())repairClockSkewSessions.add(session);}
function repairSessionExpired(session){const exp=repairSessionExp(session);return !repairClockSkewSessions.has(session)&&exp!==null&&exp<=Date.now();}
function repairQualityContext(){return {generation:qualityGeneration,session:registroSession,name:document.getElementById('nombreCompleto').value.trim(),consent:document.getElementById('autPhotoQuality').checked,files:Object.fromEntries(Object.entries(qualityIds).map(([type,id])=>[type,document.getElementById(id).files[0]]))};}
function repairQualityCurrent(context){return context.generation===qualityGeneration&&context.session===registroSession&&context.name===document.getElementById('nombreCompleto').value.trim()&&context.consent===document.getElementById('autPhotoQuality').checked&&Object.entries(qualityIds).every(([type,id])=>context.files[type]===document.getElementById(id).files[0]);}
function repairRequireAuth(message){
 if(!repairNeedsAuth){
  repairHadStoredRegistration=repairHadStoredRegistration||!!documentosSession||recoveryMode||uploadedTypes.size>0;
  repairRecoveryIdentity=repairPayloadIdentity||{cedula:cedulaVerificada||document.getElementById('cedula').value,celular:celularVerificado||celularInput.value};
  repairNeedsAuth=true;documentosSession=null;photoQualityReceipt=null;qualityExpiresAt=0;qualityGeneration++;invalidarSesionOtp();
  document.getElementById('cedula').readOnly=true;celularInput.readOnly=true;
 }
 repairShow(message+' Tus datos y fotos se conservan en esta página.',{auth:true});lockPhotoSteps();evaluarSubmit();
}
function repairOpenAuth(){
 if(repairRecoveryIdentity){document.getElementById('cedula').value=repairRecoveryIdentity.cedula;celularInput.value=repairRecoveryIdentity.celular;}
 if(repairRecoveryPanel)repairRecoveryPanel.hidden=true;
 document.getElementById('successScreen').classList.remove('show');form.classList.remove('form-hidden');
 repairShow('Verifica nuevamente el mismo celular. Después recuperaremos la solicitud guardada sin repetir sus datos ni sus fotos.',{check:!!registroSession});
 evaluarEnvioOtp();evaluarSubmit();celularInput.focus();
}
repairAuth.addEventListener('click',()=>{if(!repairNeedsAuth)repairRequireAuth('Necesitamos verificar de nuevo el celular para continuar.');repairOpenAuth();});
repairCheck.addEventListener('click',async()=>{
 if(repairResumeBusy)return;
 if(!registroSession){repairRequireAuth('La sesión venció. Necesitamos verificar de nuevo el celular.');return;}
 repairResumeBusy=true;repairCheck.disabled=true;
 try{await repairResumeRegistration();}catch{repairShow('No pudimos comprobar el resultado. Se conserva el intento original; no crees otra solicitud.',{check:true,auth:repairClockSkewSessions.has(registroSession)});}
 finally{repairResumeBusy=false;repairCheck.disabled=false;evaluarSubmit();}
});
function repairShowPendingPhotos(existing){
 repairMarkFreshSession(existing.quality_session);
 recoveryMode=true;registroSession=existing.quality_session;documentosSession=null;photoQualityReceipt=null;qualityExpiresAt=0;qualityGeneration++;
 document.getElementById('nombreCompleto').value=existing.name;uploadedTypes.clear();
 for(const type of existing.savedTypes)uploadedTypes.add(type);
 if(!repairRecoveryPanel){
  repairRecoveryPanel=document.createElement('section');repairRecoveryPanel.className='wrap';
  const title=document.createElement('h2');title.textContent='Retomar fotos pendientes';repairRecoveryPanel.append(title);
  repairRecoveryInfo=document.createElement('p');repairRecoveryPanel.append(repairRecoveryInfo);
  repairRecoveryPanel.append(document.getElementById('autPhotoQuality').closest('.checkbox-row'));
  for(const id of Object.values(qualityIds))repairRecoveryPanel.append(document.getElementById(id).closest('.field'));
  repairRecoverySave=document.createElement('button');repairRecoverySave.type='button';repairRecoverySave.textContent='Guardar fotos pendientes';
  repairRecoverySave.className='btn-submit';repairRecoverySave.style.minHeight='44px';
  repairRecoverySave.addEventListener('click',async()=>{
   if(qualityBusy||subidaFotosEnCurso||repairNeedsAuth)return;
   const consent=document.getElementById('autPhotoQuality'),previousConsent=consent.disabled;
   qualityBusy=true;consent.disabled=true;repairRecoverySave.disabled=true;lockPhotoSteps();evaluarSubmit();
   try{
    if(!await preparePhotoQuality())return;
    repairRecoveryPanel.hidden=true;document.getElementById('successScreen').classList.add('show');await manejarFotosPostRegistro();
   }catch{repairRecoveryInfo.textContent='No se completó la revisión. Tus datos y fotos se conservan; vuelve a intentarlo.';}
   finally{qualityBusy=false;consent.disabled=previousConsent;repairRecoverySave.disabled=false;lockPhotoSteps();evaluarSubmit();}
  });
  repairRecoveryPanel.append(repairRecoverySave);form.after(repairRecoveryPanel);
 }
 repairRecoveryInfo.textContent='Conservamos tus datos y las fotos guardadas. Continúa únicamente con las pendientes.';
 for(const [type,id]of Object.entries(qualityIds)){
  const saved=uploadedTypes.has(type);document.getElementById(id).closest('.field').hidden=saved;
  if(saved)qualityStates[type]={status:'auto_approved'};
 }
 form.classList.add('form-hidden');repairRecoveryPanel.hidden=false;document.getElementById('successScreen').classList.remove('show');lockPhotoSteps();
}
async function repairResumeRegistration(){
 const session=registroSession,identity={cedula:document.getElementById('cedula').value,celular:celularInput.value};
 if(repairRecoveryIdentity&&!repairSameIdentity(repairRecoveryIdentity))throw Error('recovery_identity_changed');
 if(repairSessionExpired(session)){repairRequireAuth('La sesión venció antes de comprobar el registro.');return;}
 const response=await fetch(API+'/api/registro/nova-retomar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({registro_session:session,enlace_token:enlaceToken}),signal:AbortSignal.timeout(15000)});
 const existing=await response.json();
 if(session!==registroSession||!repairSameIdentity(identity))throw Error('resume_context_changed');
 if(!response.ok){
  if((response.status===400&&existing.error==='Sesión de registro inválida o vencida')||repairSessionExpired(session)){repairRequireAuth('La sesión venció. Necesitamos verificar de nuevo el celular.');return;}
  throw Error('resume_unavailable');
 }
 if(existing.ok!==true||typeof existing.found!=='boolean')throw Error('resume_invalid_response');
 if(existing.found){
  repairNeedsAuth=false;repairRegistrationUncertain=false;repairRegistrationBlocked=false;repairPayloadMayRenew=false;repairClearNotice();
  repairRecoveryIdentity=null;document.getElementById('cedula').readOnly=false;celularInput.readOnly=false;
  if(existing.incomplete){repairShowPendingPhotos(existing);return;}
  if(typeof existing.documentos_session!=='string')throw Error('resume_session_missing');
  documentosSession=existing.documentos_session;for(const type of Object.keys(qualityIds))uploadedTypes.add(type);
  if(repairRecoveryPanel)repairRecoveryPanel.hidden=true;form.classList.add('form-hidden');document.getElementById('successScreen').classList.add('show');await consultarRecepcion();return;
 }
 if(submittedPayload&&submittedPayload.registro_session!==registroSession&&!repairPayloadMayRenew)repairRegistrationUncertain=true;
 if(repairRegistrationUncertain){
  repairRegistrationBlocked=!!submittedPayload&&submittedPayload.registro_session!==registroSession;
  repairShow('Todavía no se confirmó el resultado del intento original. Conservamos tus datos y fotos. Comprobar de nuevo no crea otra solicitud.',{check:true});return;
 }
 if(repairHadStoredRegistration){repairRegistrationBlocked=true;repairShow('No pudimos recuperar todavía la solicitud guardada. Tus datos y fotos se conservan; comprueba de nuevo sin crear otra solicitud.',{check:true});return;}
 if(repairPayloadMayRenew&&submittedPayload){
  if(!repairPayloadIdentity||!repairSameIdentity(repairPayloadIdentity))throw Error('registration_identity_changed');
  submittedPayload.registro_session=registroSession;repairPayloadMayRenew=false;photoQualityReceipt=null;qualityExpiresAt=0;
 }
 repairNeedsAuth=false;repairRegistrationBlocked=false;repairRecoveryIdentity=null;document.getElementById('cedula').readOnly=false;celularInput.readOnly=false;repairClearNotice();queuePhotoReview();
}
// END NOVA FLOW REPAIR 20261030.1
`;

const prepareQuality = String.raw`async function preparePhotoQuality(){
 if(documentosSession&&qualityPhotos&&!recoveryMode)return true;
 if(!document.getElementById('autPhotoQuality').checked){mostrarErrorRegistro('Acepta la revisión de fotos para continuar.');return false;}
 if(repairSessionExpired(registroSession)){repairRequireAuth('La sesión venció antes de revisar las fotos.');return false;}
 if(photoQualityReceipt&&qualityPhotos&&qualityExpiresAt>Date.now()+10000)return true;
 const context=repairQualityContext(),prepared=await preparedQualityPhotos();
 if(!repairQualityCurrent(context)){mostrarErrorRegistro('La foto o los datos cambiaron durante la revisión. Conservamos la selección actual; vuelve a continuar.');return false;}
 if((!recoveryMode&&Object.keys(prepared).length!==3)||(recoveryMode&&['frente','reverso','selfie'].some(t=>!uploadedTypes.has(t)&&!prepared[t]))){mostrarErrorRegistro('Completa las tres fotos.');return false;}
 const response=await fetch(API+'/api/registro/nova-calidad-fotos',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(60000),body:JSON.stringify({registro_session:context.session,enlace_token:enlaceToken,name:context.name,consent:true,consent_version:'nova-photo-quality-v3',photos:prepared,...recoveryMode?{partial:true,request_receipt:true}:{}})});
 const result=await response.json();
 if(!repairQualityCurrent(context)){mostrarErrorRegistro('La foto o los datos cambiaron durante la revisión. Conservamos la selección actual; vuelve a continuar.');return false;}
 renderQuality(result);
 if(!response.ok||result.ok!==true){
  if((response.status===400&&result.error==='Sesión de registro inválida o vencida')||(response.status===403&&repairSessionExpired(context.session)))repairRequireAuth('La sesión venció antes de revisar las fotos.');
  else if(response.status===403&&result.error==='Verifica el celular y acepta la revisión de fotos antes de continuar.')repairShow('No se pudo validar la sesión para revisar las fotos. Tus datos y fotos se conservan; puedes verificar de nuevo el celular.',{auth:true});
  else mostrarErrorRegistro(result.error||'Corrige únicamente las fotos señaladas para continuar.');return false;
 }
 if(typeof result.receipt!=='string'||!Number.isFinite(result.expiresAt)||result.expiresAt<=Date.now()+10000)throw Error('Invalid quality receipt');
 if(recoveryMode){if(typeof result.documentos_session!=='string')throw Error('missing_resume_session');documentosSession=result.documentos_session;}
 photoQualityReceipt=result.receipt;qualityPhotos=prepared;qualityExpiresAt=result.expiresAt;return true;
}

`;

const verifyOtp = String.raw`btnVerificarOtp.addEventListener('click', async () => {
  const celular=celularInput.value,cedula=document.getElementById('cedula').value,codigo=codigoOtpInput.value;
  if(codigo.length!==6||repairVerificationBusy)return;
  const otpVerifyManaged=smsOtpEnabled;
  if(otpVerifyManaged&&!puedeVerificarOtpGestionado())return;
  const releaseOtpIdentity=bloquearIdentidadOtpGestionado();repairVerificationBusy=true;
  if(otpVerifyManaged){otpManagedVerifying=true;renderOtpGestionado();}
  btnVerificarOtp.disabled=true;evaluarEnvioOtp();
  try{
   const res=await fetch(API+'/api/otp/verificar',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({enlace_token:enlaceToken,cedula,celular,codigo})});
   const data=await res.json().catch(()=>({}));
   if(!repairSameIdentity({cedula,celular})){
    mostrarErrorOtp('La cédula o el celular cambiaron durante la verificación. Conservamos tus datos y fotos; verifica la identidad actual.');return;
   }
   if(res.ok&&data.ok===true&&typeof data.registro_session==='string'){
    registroSession=data.registro_session;repairMarkFreshSession(registroSession);
    if(otpVerifyManaged&&otpManagedAttempt)otpManagedAttempt.state='verified';
    otpVerificado=true;celularVerificado=celular;cedulaVerificada=cedula;
    otpStatus.className='otp-status ok';otpStatus.textContent='✓ Celular verificado';codeRow.classList.remove('show');
    // Lookup first: an existing registration resumes without another registration or automatic OCR.
    try{await repairResumeRegistration();}
    catch{repairRegistrationBlocked=true;repairShow('El celular se verificó, pero no pudimos comprobar si la solicitud ya está guardada. Conservamos tus datos y fotos; pulsa Comprobar registro.',{check:true,auth:repairClockSkewSessions.has(registroSession)});}
   }else if(res.status===404)mostrarBloqueoEnlace();
   else if(res.status===429)mostrarErrorOtp('Se agotaron los intentos de este código. Solicita uno nuevo.');
   else mostrarErrorOtp('Código incorrecto, vencido o ya utilizado.');
  }catch{mostrarErrorOtp('Error de conexión al verificar. Tus datos y fotos se conservan; intenta de nuevo.');}
  finally{
   repairVerificationBusy=false;releaseOtpIdentity();btnVerificarOtp.disabled=false;
   if(otpVerifyManaged){otpManagedVerifying=false;renderOtpGestionado();}
   evaluarEnvioOtp();evaluarSubmit();
  }
});

`;

export function transformForm(source) {
  if (createHash('sha256').update(source).digest('hex') !== FORM_BASE_SHA256) throw new Error('NOVA_FORM_BASELINE_DRIFT');
  let result=once(source,'// BEGIN NOVA SMS UI 20261030.1',repairHelpers+'\n// BEGIN NOVA SMS UI 20261030.1');
  result=once(result,'async function reviewCapturedPhoto(){\n if(documentosSession)return;',`async function reviewCapturedPhoto(){
 if(documentosSession||qualityBusy)return;
 if(registroSession&&repairSessionExpired(registroSession)){repairRequireAuth('La sesión venció antes de revisar las fotos.');return;}`);
  result=once(result,"if(!r.ok&&!d.errors)mostrarErrorRegistro(d.error||'No pudimos guardar la revisión. Tus fotos se conservan; vuelve a intentarlo.');",`if(!r.ok&&!d.errors){
   if(r.status===403&&repairSessionExpired(registroSession))repairRequireAuth('La sesión venció antes de revisar las fotos.');
   else if(r.status===403&&d.error==='Verifica el celular y acepta la revisión de fotos antes de continuar.')repairShow('No se pudo validar la sesión para revisar las fotos. Tus datos y fotos se conservan; puedes verificar de nuevo el celular.',{auth:true});
   else mostrarErrorRegistro(d.error||'No pudimos guardar la revisión. Tus fotos se conservan; vuelve a intentarlo.');
  }`);
  result=block(result,'async function preparePhotoQuality(){','const enlaceToken =',prepareQuality);
  result=once(result,'function invalidarSesionOtp() {',`function invalidarSesionOtp() {
  photoQualityReceipt=null;qualityExpiresAt=0;qualityGeneration++;
  if(otpManagedAttempt?.state==='verified'){
    otpManagedAttempt=null;if(otpManagedTimer){clearTimeout(otpManagedTimer);otpManagedTimer=null;}
  }`);
  result=once(result,'if (otpManagedSending || otpManagedChecking || otpManagedVerifying || otpVerificado) return true;','if (repairVerificationBusy || otpManagedSending || otpManagedChecking || otpManagedVerifying || otpVerificado) return true;');
  result=once(result,'return !otpManagedSending && !otpManagedChecking && !otpManagedVerifying && !otpVerificado &&','return !repairVerificationBusy && !otpManagedSending && !otpManagedChecking && !otpManagedVerifying && !otpVerificado &&');
  result=once(result,"if (smsOtpEnabled) { renderOtpGestionado(); return; }\n  btnEnviarOtp.disabled =", "if (smsOtpEnabled) { renderOtpGestionado(); if(repairVerificationBusy)btnEnviarOtp.disabled=true; return; }\n  btnEnviarOtp.disabled = repairVerificationBusy ||");
  result=once(result,"btnEnviarOtp.addEventListener('click', async () => {\n  if (smsOtpEnabled)","btnEnviarOtp.addEventListener('click', async () => {\n  if(repairVerificationBusy)return;\n  if (smsOtpEnabled)");
  result=once(result,"if (res.ok && data.ok === true) {\n      otpStatus.className",`if(res.status===202&&data.pending===true){
      otpStatus.className='otp-status pending';
      if(data.state==='accepted'){
        otpStatus.textContent='Ya hay un código solicitado. Si lo recibiste, ingrésalo; si no llega, espera antes de solicitar otro.';codeRow.classList.add('show');
      }else{
        otpStatus.textContent='El envío del código aún no está confirmado. Conservamos tus datos y fotos. Espera antes de solicitar otro.';codeRow.classList.remove('show');
      }
    }else if(res.status===409&&data.reason==='active_challenge'){
      mostrarErrorOtp('Ya hay una verificación en curso. Espera a que venza antes de solicitar otro código. Tus datos y fotos se conservan.');codeRow.classList.remove('show');
    }else if (res.ok && data.ok === true) {
      otpStatus.className`);
  result=block(result,"btnVerificarOtp.addEventListener('click', async () => {",'// ─── Habilitar botón final',verifyOtp);
  result=once(result,'const ok =\n    contextoValido &&','const ok =\n    !repairNeedsAuth && !repairRegistrationBlocked && !repairVerificationBusy &&\n    contextoValido &&');
  result=once(result,'if (res.ok) uploadedTypes.add(tipo);\n    return res.ok;',`if(res.ok)uploadedTypes.add(tipo);
    else if(res.status===400){
      const data=await res.json().catch(()=>({}));
      if(data.error==='Sesión de documentos inválida o vencida')repairRequireAuth('La sesión para subir fotos venció.');
    }
    return res.ok;`);
  result=once(result,'  } else {\n    mostrarErrorDocumento(\n      \'Tu registro está guardado.',"  } else if(!repairNeedsAuth) {\n    mostrarErrorDocumento(\n      'Tu registro está guardado.");
  result=once(result,'  if (subidaFotosEnCurso) return;\n  btn.disabled = true;', '  if (subidaFotosEnCurso) return;\n  if(repairNeedsAuth){repairOpenAuth();return;}\n  btn.disabled = true;');
  result=once(result,"  } else {\n    mostrarErrorDocumento(\n      'Las fotos siguen pendientes.","  } else if(!repairNeedsAuth) {\n    mostrarErrorDocumento(\n      'Las fotos siguen pendientes.");
  result=once(result,"  if (btnSubmit.disabled || registroEnCurso || qualityBusy) return;\n  qualityBusy=true;",`  if (btnSubmit.disabled || registroEnCurso || qualityBusy || repairNeedsAuth || repairRegistrationBlocked) return;
  if(submittedPayload&&submittedPayload.registro_session!==registroSession){repairRegistrationUncertain=true;repairRegistrationBlocked=true;repairShow('Se conserva el intento original sin confirmar. Comprueba su resultado antes de continuar.',{check:true});evaluarSubmit();return;}
  qualityBusy=true;`);
  result=once(result,'try{ready=await preparePhotoQuality();}', 'try{ready=repairRegistrationUncertain&&submittedPayload?true:await preparePhotoQuality();}');
  result=once(result,'  payload.photo_quality_receipt=photoQualityReceipt;\n  submittedPayload = payload;',`  if(!repairRegistrationUncertain)payload.photo_quality_receipt=photoQualityReceipt;
  if(!submittedPayload)repairPayloadIdentity={cedula:cedulaVerificada,celular:celularVerificado};
  submittedPayload = payload;`);
  result=once(result,'      documentosSession = data.documentos_session;\n      form.classList', '      repairRegistrationUncertain=false;repairRegistrationBlocked=false;repairPayloadMayRenew=false;repairClearNotice();\n      documentosSession = data.documentos_session;\n      form.classList');
  result=once(result,"    } else if (res.status === 400) {\n      mostrarErrorRegistro(",`    } else if(res.status===400&&data.error==='Sesión de registro inválida o vencida'){
      if(!repairRegistrationUncertain)repairPayloadMayRenew=true;
      else repairRegistrationBlocked=true;
      repairRequireAuth(repairRegistrationUncertain?'El resultado del intento original sigue sin confirmar y su sesión venció.':'La sesión venció antes de guardar el registro.');
    } else if (res.status === 400) {
      mostrarErrorRegistro(`);
  result=once(result,"      photoQualityReceipt=null;qualityPhotos=null;submittedPayload=null;mostrarErrorRegistro('La revisión de fotos venció o cambió. Pulsa Enviar registro para revisarlas nuevamente.');",`      if(repairRegistrationUncertain){repairRegistrationBlocked=true;repairShow('El resultado del intento original sigue sin confirmar. Compruébalo antes de volver a revisar las fotos o crear una solicitud.',{check:true});}
      else{photoQualityReceipt=null;qualityPhotos=null;submittedPayload=null;mostrarErrorRegistro('La revisión de fotos venció o cambió. Pulsa Enviar registro para revisarlas nuevamente.');}`);
  result=once(result,"      mostrarErrorRegistro('No se confirmó el envío. Reintenta sin cambiar los datos ni pedir otro código.');",`      repairRegistrationUncertain=true;repairShow('No se confirmó el envío. Conservamos el intento original y las fotos. Comprueba su resultado o reintenta el mismo envío sin pedir otro código.',{check:true});
      mostrarErrorRegistro('No se confirmó el envío. Reintenta el mismo intento sin cambiar los datos ni pedir otro código.');`);
  result=once(result,"  } catch {\n    mostrarErrorRegistro('No se pudo confirmar el envío.","  } catch {\n    repairRegistrationUncertain=true;repairShow('No pudimos confirmar el resultado. Conservamos el intento original y las fotos. Comprueba el registro antes de crear otro.',{check:true});\n    mostrarErrorRegistro('No se pudo confirmar el envío.");
  result=once(result,"    if (!r.ok || data.ok!==true) throw Error('unavailable');",`    if(!r.ok||data.ok!==true){
      if(r.status===400&&data.error==='Sesión de documentos inválida o vencida'){repairRequireAuth('La sesión de consulta venció.');return;}
      throw Error('unavailable');
    }`);
  return result;
}

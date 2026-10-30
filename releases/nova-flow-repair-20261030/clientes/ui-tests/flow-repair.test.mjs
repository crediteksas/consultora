import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { createHash } from 'node:crypto';
import { transformForm, FORM_BASE_SHA256 } from '../ui-transform.mjs';
import { baseline, candidate, fixture, completeForm, verified } from './form-harness.mjs';

const states={frente:{status:'auto_approved'},reverso:{status:'auto_approved'},selfie:{status:'auto_approved'}};
const expiredRegistration={status:400,data:{ok:false,error:'Sesión de registro inválida o vencida'}};
const expiredDocuments={status:400,data:{ok:false,error:'Sesión de documentos inválida o vencida'}};
const quality=(receipt='receipt-B',documents='documents-B')=>({data:{ok:true,receipt,expiresAt:2500000,documentos_session:documents,photoStates:states}});
const tokenExp=exp=>Buffer.from(JSON.stringify({purpose:'registro',exp})).toString('base64url')+'.synthetic-not-a-signature';

test('builder pins the actual baseline, deterministically transforms it and rejects drift/double application',()=>{
  assert.equal(createHash('sha256').update(baseline).digest('hex'),FORM_BASE_SHA256);
  assert.equal(transformForm(baseline),candidate);
  assert.throws(()=>transformForm(baseline+'\n'),/BASELINE_DRIFT/);
  assert.throws(()=>transformForm(candidate),/BASELINE_DRIFT/);
  for(const match of candidate.matchAll(/<script>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new Function(match[1]));
  assert.ok(candidate.includes('novaCameraDialog'));assert.ok(candidate.includes('BEGIN NOVA SMS UI'));
  assert.ok(!candidate.includes('form.reset('));
});

test('PHOTO01: expired upload offers in-page verification, preserves File nodes, and resumes only missing photos',async()=>{
  let renewed=false;const uploaded=[];
  const f=fixture(async(path,body)=>{
    if(path==='/api/documentos'){uploaded.push(body);return renewed?{data:{ok:true}}:expiredDocuments;}
    if(path==='/api/otp/enviar')return {data:{ok:true}};
    if(path==='/api/otp/verificar'){renewed=true;return {data:{ok:true,registro_session:'renewed-verified-session'}};}
    if(path==='/api/registro/nova-retomar')return {data:{ok:true,found:true,incomplete:true,quality_session:'same-source-renewed-session',name:'Persona de prueba',savedTypes:['frente']}};
    if(path==='/api/registro/nova-calidad-fotos'){assert.deepEqual(Object.keys(body.photos).sort(),['reverso','selfie']);return quality();}
    if(path==='/api/registro/nova-estado')return {data:{ok:true,nova_status:'review_required'}};
    throw Error('Unhandled mock '+path);
  });
  completeForm(f);verified(f);
  f.run("documentosSession='expired-documents';uploadedTypes.add('frente');form.classList.add('form-hidden');document.getElementById('successScreen').classList.add('show');lockPhotoSteps();");
  await f.run('manejarFotosPostRegistro()');
  assert.equal(f.run('repairNeedsAuth'),true);assert.equal(f.run('repairNotice.hidden'),false);
  assert.match(f.run('repairMessage.textContent'),/sesión.*venció/i);
  const oldUploads=uploaded.length;await f.nodes.get('btnReintentarFotos').fire('click');
  assert.equal(uploaded.length,oldUploads,'Retry never resubmits expired credentials');
  assert.equal(f.nodes.get('formRegistro').classList.contains('form-hidden'),false);
  assert.equal(f.nodes.get('cedula').readOnly,true);assert.equal(f.nodes.get('celular').readOnly,true);
  f.assertFiles();f.captcha();await f.click('btnEnviarOtp');f.nodes.get('codigoOtp').value='123456';await f.click('btnVerificarOtp');
  assert.equal(f.run('repairNeedsAuth'),false);assert.equal(f.run('registroSession'),'same-source-renewed-session');
  assert.equal(f.run('repairRecoveryPanel.hidden'),false);
  assert.equal(f.calls.filter(c=>c.path==='/api/registro').length,0);
  await f.run('repairRecoverySave.fire("click")');
  assert.equal(f.run('uploadedTypes.size'),3);assert.deepEqual(uploaded.slice(oldUploads).map(p=>p.tipo).sort(),['reverso','selfie']);
  assert.ok(uploaded.slice(oldUploads).every(p=>p.documentos_session==='documents-B'));
  assert.equal(f.calls.filter(c=>c.path==='/api/registro/nova-calidad-fotos').length,1);
  f.assertFiles();
});

test('PHOTO01 negative: a stored registration not found after reauthentication cannot become a new registration',async()=>{
  const f=fixture(async(path)=>{
    if(path==='/api/documentos')return expiredDocuments;
    if(path==='/api/otp/verificar')return {data:{ok:true,registro_session:'fresh-session'}};
    if(path==='/api/registro/nova-retomar')return {data:{ok:true,found:false}};
    throw Error('Unhandled mock '+path);
  });
  completeForm(f);verified(f);f.run("documentosSession='expired-documents';form.classList.add('form-hidden');");
  await f.run('manejarFotosPostRegistro()');await f.run('repairAuth.fire("click")');
  f.nodes.get('codigoOtp').value='123456';await f.click('btnVerificarOtp');
  assert.equal(f.run('repairRegistrationBlocked'),true);assert.equal(f.nodes.get('btnSubmit').disabled,true);
  await f.nodes.get('formRegistro').fire('submit');assert.equal(f.calls.filter(c=>c.path==='/api/registro').length,0);f.assertFiles();
});

test('PHOTO01: an expired receipt query can renew and return to the existing completed registration',async()=>{
  let fresh=false;
  const f=fixture(async(path)=>{
    if(path==='/api/registro/nova-estado')return fresh?{data:{ok:true,nova_status:'review_required'}}:expiredDocuments;
    if(path==='/api/otp/verificar')return {data:{ok:true,registro_session:'new-auth'}};
    if(path==='/api/registro/nova-retomar'){fresh=true;return {data:{ok:true,found:true,documentos_session:'same-source-docs'}};}
    throw Error('Unhandled mock '+path);
  });
  completeForm(f);verified(f);f.run("documentosSession='expired-docs';for(const t of Object.keys(qualityIds))uploadedTypes.add(t);form.classList.add('form-hidden');");
  await f.run('consultarRecepcion()');assert.equal(f.run('repairNeedsAuth'),true);
  await f.run('repairAuth.fire("click")');f.nodes.get('codigoOtp').value='123456';await f.click('btnVerificarOtp');
  assert.equal(f.run('documentosSession'),'same-source-docs');assert.equal(f.run('repairNotice.hidden'),true);
  assert.equal(f.calls.filter(c=>c.path==='/api/registro'||c.path==='/api/documentos'||c.path==='/api/registro/nova-calidad-fotos').length,0);f.assertFiles();
});

test('PHOTO02: Save locks photos/consent and a programmatic replacement discards the stale review without uploading photo A',async()=>{
  let releaseReview,qualityCalls=0;const uploaded=[];
  const f=fixture(async(path,body)=>{
    if(path==='/api/otp/verificar')return {data:{ok:true,registro_session:'verified-session'}};
    if(path==='/api/registro/nova-retomar')return {data:{ok:true,found:true,incomplete:true,quality_session:'source-session',name:'Persona de prueba',savedTypes:['reverso','selfie']}};
    if(path==='/api/registro/nova-calidad-fotos'){
      if(++qualityCalls===1)return new Promise(done=>{releaseReview=()=>done(quality('receipt-A','documents-A'));});
      assert.equal(body.photos.frente,'prepared-photo-B');return quality();
    }
    if(path==='/api/documentos'){uploaded.push(body);return {data:{ok:true}};}
    if(path==='/api/registro/nova-estado')return {data:{ok:true,nova_status:'review_required'}};
    throw Error('Unhandled mock '+path);
  });
  completeForm(f);verified(f);f.run("otpVerificado=false;");f.nodes.get('codigoOtp').value='123456';await f.click('btnVerificarOtp');
  f.run("qualityBlobCache.set(document.getElementById('fotoFrente').files[0],'prepared-photo-A');");
  const pending=f.run('repairRecoverySave.fire("click")');await Promise.resolve();await Promise.resolve();
  assert.equal(f.nodes.get('fotoFrente').disabled,true);assert.equal(f.nodes.get('autPhotoQuality').disabled,true);
  const photoB=new File(['synthetic-B'],'photo-B.jpg',{type:'image/jpeg'});f.nodes.get('fotoFrente').files=[photoB];f.context.photoB=photoB;
  f.run("qualityBlobCache.set(photoB,'prepared-photo-B');");await f.nodes.get('fotoFrente').fire('change');
  releaseReview();await pending;
  assert.equal(uploaded.length,0);assert.equal(f.run('documentosSession'),null);assert.equal(f.run('photoQualityReceipt'),null);
  assert.equal(f.run('repairRecoveryPanel.hidden'),false);assert.equal(f.nodes.get('fotoFrente').files[0],photoB);
  assert.equal(f.nodes.get('autPhotoQuality').disabled,false);assert.equal(f.run('qualityBusy'),false);
  await f.run('repairRecoverySave.fire("click")');
  assert.equal(uploaded.length,1);assert.equal(uploaded[0].foto_base64,'prepared-photo-B');assert.equal(f.nodes.get('fotoFrente').files[0],photoB);
  for(const [index,id]of ['fotoReverso','fotoSelfie'].entries())assert.equal(f.nodes.get(id).files[0],f.fileSnapshots[index+1]);
});

test('PHOTO02 negative: a name change before compression settles prevents even the stale quality request',async()=>{
  const f=fixture(async path=>{throw Error('No request expected '+path);});completeForm(f);verified(f);
  f.run('photoQualityReceipt=null;qualityExpiresAt=0;');const pending=f.run('preparePhotoQuality()');
  f.nodes.get('nombreCompleto').value='Otro nombre sintético';assert.equal(await pending,false);
  assert.equal(f.calls.length,0);f.assertFiles();
});

test('PHOTO01: a locally expired session offers verification before quality work and keeps the cached bytes and Files',async()=>{
  const f=fixture(async path=>{throw Error('No network/AI expected '+path);});completeForm(f);verified(f,tokenExp(999999));
  assert.equal(await f.run('preparePhotoQuality()'),false);assert.equal(f.run('repairNeedsAuth'),true);
  assert.equal(f.run('qualityPhotos.frente'),'prepared-front');assert.equal(f.calls.length,0);f.assertFiles();
});

test('PHOTO01: expiration in transit plus the real quality endpoint 403 recovers instead of looping the same review',async()=>{
  let f;f=fixture(async path=>{
    assert.equal(path,'/api/registro/nova-calidad-fotos');f.advance(2000);
    return {status:403,data:{ok:false,error:'Verifica el celular y acepta la revisión de fotos antes de continuar.'}};
  });
  completeForm(f);verified(f,tokenExp(1001000));f.run('photoQualityReceipt=null;qualityExpiresAt=0;');
  assert.equal(await f.run('preparePhotoQuality()'),false);assert.equal(f.run('repairNeedsAuth'),true);assert.equal(f.calls.length,1);
  assert.match(f.run('repairMessage.textContent'),/sesión venció/);f.assertFiles();
});

test('PHOTO01 negative: malformed or future token claims never grant access or bypass server validation',async()=>{
  const f=fixture(async path=>{assert.equal(path,'/api/registro/nova-calidad-fotos');return {status:403,data:{ok:false,error:'Acceso no permitido.'}};});
  completeForm(f);verified(f,'malformed');f.run('photoQualityReceipt=null;qualityExpiresAt=0;');
  assert.equal(f.run("repairSessionExpired('malformed')"),false);
  f.context.future=tokenExp(3000000);assert.equal(f.run('repairSessionExpired(future)'),false);
  assert.equal(await f.run('preparePhotoQuality()'),false);assert.equal(f.run('photoQualityReceipt'),null);
  assert.equal(f.calls.length,1);assert.equal(f.calls.filter(c=>c.path==='/api/registro').length,0);f.assertFiles();
});

test('PHOTO01 clock skew: a freshly server-verified token that looks expired locally is still checked by the server, with no renewal loop',async()=>{
  const freshToken=tokenExp(999999);let qualityCalls=0;
  const f=fixture(async path=>{
    if(path==='/api/otp/verificar')return {data:{ok:true,registro_session:freshToken}};
    if(path==='/api/registro/nova-retomar')return {data:{ok:true,found:false}};
    if(path==='/api/registro/nova-calidad-fotos'){qualityCalls++;return quality();}
    throw Error('Unhandled mock '+path);
  });
  completeForm(f);f.nodes.get('codigoOtp').value='123456';await f.click('btnVerificarOtp');
  assert.equal(f.run('repairNeedsAuth'),false);assert.equal(f.run('registroSession'),freshToken);
  assert.equal(f.run('repairSessionExpired(registroSession)'),false,'Only the UI hint is suppressed for this freshly confirmed token');
  f.run("qualityPhotos={frente:'front',reverso:'back',selfie:'selfie'};for(const [type,id]of Object.entries(qualityIds))qualityBlobCache.set(document.getElementById(id).files[0],qualityPhotos[type]);");
  assert.equal(await f.run('preparePhotoQuality()'),true);assert.equal(qualityCalls,1);assert.equal(f.calls.filter(c=>c.path==='/api/otp/verificar').length,1);f.assertFiles();
});

test('PHOTO01 clock skew negative: a generic quality 403 offers explicit recovery without claiming expiration or sending automatically',async()=>{
  const f=fixture(async path=>{assert.equal(path,'/api/registro/nova-calidad-fotos');return {status:403,data:{ok:false,error:'Verifica el celular y acepta la revisión de fotos antes de continuar.'}};});
  completeForm(f);verified(f,tokenExp(3000000));f.run('photoQualityReceipt=null;qualityExpiresAt=0;');
  assert.equal(await f.run('preparePhotoQuality()'),false);assert.equal(f.run('repairNeedsAuth'),false);
  assert.equal(f.run('repairAuth.hidden'),false);assert.match(f.run('repairMessage.textContent'),/No se pudo validar/);assert.doesNotMatch(f.run('repairMessage.textContent'),/venció|vencida/);
  assert.equal(f.calls.length,1);await f.run('repairAuth.fire("click")');assert.equal(f.run('repairNeedsAuth'),true);assert.equal(f.calls.length,1);f.assertFiles();
});

test('PHOTO01: a second expiration reuses the same recovery panel and File inputs',async()=>{
  let stage=0;const f=fixture(async path=>{
    if(path==='/api/otp/verificar')return {data:{ok:true,registro_session:'auth-'+stage}};
    if(path==='/api/registro/nova-retomar')return {data:{ok:true,found:true,incomplete:true,quality_session:'source-'+stage,name:'Persona de prueba',savedTypes:['frente']}};
    if(path==='/api/registro/nova-calidad-fotos')return quality();
    if(path==='/api/documentos')return expiredDocuments;
    throw Error('Unhandled mock '+path);
  });
  completeForm(f);verified(f);f.nodes.get('codigoOtp').value='123456';await f.click('btnVerificarOtp');
  const panel=f.run('repairRecoveryPanel');await f.run('repairRecoverySave.fire("click")');assert.equal(f.run('repairNeedsAuth'),true);
  stage=1;await f.run('repairAuth.fire("click")');f.nodes.get('codigoOtp').value='654321';await f.click('btnVerificarOtp');
  assert.equal(f.run('repairRecoveryPanel'),panel);assert.equal(f.run('repairRecoveryPanel.hidden'),false);assert.equal(f.run('registroSession'),'source-1');
  assert.equal(f.calls.filter(c=>c.path==='/api/registro').length,0);f.assertFiles();
});

test('OTP01: both identity inputs stay locked for the entire legacy verify and a late DOM mutation cannot verify identity B',async()=>{
  let finishVerify;
  const f=fixture(async path=>{
    if(path==='/api/otp/verificar')return new Promise(done=>{finishVerify=()=>done({data:{ok:true,registro_session:'session-for-A'}});});
    throw Error('No stale context requests allowed '+path);
  });
  completeForm(f);f.nodes.get('codigoOtp').value='123456';const pending=f.click('btnVerificarOtp');
  assert.equal(f.nodes.get('cedula').disabled,true);assert.equal(f.nodes.get('celular').disabled,true);assert.equal(f.nodes.get('btnEnviarOtp').disabled,true);
  await f.nodes.get('btnVerificarOtp').fire('click');assert.equal(f.calls.length,1,'Double verify does not start another request');
  f.nodes.get('cedula').value='87654321';await f.nodes.get('cedula').fire('input');finishVerify();await pending;
  assert.equal(f.calls[0].body.cedula,'12345678');assert.equal(f.run('otpVerificado'),false);assert.equal(f.run('registroSession'),null);
  assert.equal(f.nodes.get('btnSubmit').disabled,true);assert.equal(f.nodes.get('cedula').disabled,false);assert.equal(f.nodes.get('celular').disabled,false);
  assert.match(f.nodes.get('otpStatus').textContent,/cambiaron durante/);f.assertFiles();
});

test('OTP01 negative: a valid slow verification binds only the captured identity and checks resume before any photo work',async()=>{
  const f=fixture(async path=>{
    if(path==='/api/otp/verificar')return {data:{ok:true,registro_session:'session-A'}};
    if(path==='/api/registro/nova-retomar')return {data:{ok:true,found:false}};
    throw Error('Unhandled mock '+path);
  });
  completeForm(f);f.nodes.get('codigoOtp').value='123456';await f.click('btnVerificarOtp');
  assert.equal(f.run('cedulaVerificada'),'12345678');assert.equal(f.run('celularVerificado'),'3000000000');
  assert.equal(f.run('registroSession'),'session-A');assert.equal(f.nodes.get('btnSubmit').disabled,false);f.assertFiles();
});

test('OTP01: failed resume lookup keeps verified access and exposes an explicit lookup retry without another OTP',async()=>{
  let lookups=0;
  const f=fixture(async path=>{
    if(path==='/api/otp/verificar')return {data:{ok:true,registro_session:'session-A'}};
    if(path==='/api/registro/nova-retomar'){if(++lookups===1)throw Error('Synthetic offline');return {data:{ok:true,found:false}};}
    throw Error('Unhandled mock '+path);
  });
  completeForm(f);f.nodes.get('codigoOtp').value='123456';await f.click('btnVerificarOtp');
  assert.equal(f.run('otpVerificado'),true);assert.equal(f.run('repairRegistrationBlocked'),true);assert.equal(f.run('repairCheck.hidden'),false);
  await f.run('repairCheck.fire("click")');assert.equal(f.run('repairRegistrationBlocked'),false);assert.equal(f.nodes.get('btnSubmit').disabled,false);
  assert.equal(f.calls.filter(c=>c.path==='/api/otp/verificar').length,1);f.assertFiles();
});

test('OTP02: an exact pre-RPC session rejection can replace only the credential and receipt after explicit verification',async()=>{
  let registrations=0;const f=fixture(async(path)=>{
    if(path==='/api/registro')return ++registrations===1?expiredRegistration:{data:{ok:true,documentos_session:'documents-B'}};
    if(path==='/api/otp/verificar')return {data:{ok:true,registro_session:'session-B'}};
    if(path==='/api/registro/nova-retomar')return {data:{ok:true,found:false}};
    if(path==='/api/registro/nova-calidad-fotos')return quality();
    if(path==='/api/documentos')return {data:{ok:true}};
    if(path==='/api/registro/nova-estado')return {data:{ok:true,nova_status:'review_required'}};
    throw Error('Unhandled mock '+path);
  });
  completeForm(f);verified(f);await f.nodes.get('formRegistro').fire('submit');
  assert.equal(f.run('repairPayloadMayRenew'),true);assert.equal(f.run('repairNeedsAuth'),true);assert.equal(f.run('submittedPayload.registro_session'),'session-A');
  await f.run('repairAuth.fire("click")');f.nodes.get('codigoOtp').value='123456';await f.click('btnVerificarOtp');
  assert.equal(f.run('submittedPayload.registro_session'),'session-B');assert.equal(f.nodes.get('btnSubmit').disabled,false);
  await f.nodes.get('formRegistro').fire('submit');
  const posts=f.calls.filter(c=>c.path==='/api/registro');assert.equal(posts.length,2);
  const old={...posts[0].body,registro_session:'session-B',photo_quality_receipt:'receipt-B'};assert.deepEqual(posts[1].body,old);
  assert.equal(f.run('uploadedTypes.size'),3);f.assertFiles();
});

test('OTP02 negative: a generic 400 never authorizes swapping the OTP-bound credential',async()=>{
  const f=fixture(async path=>{assert.equal(path,'/api/registro');return {status:400,data:{ok:false,error:'No se pudo guardar el registro'}};});
  completeForm(f);verified(f);await f.nodes.get('formRegistro').fire('submit');
  assert.equal(f.run('repairPayloadMayRenew'),false);assert.equal(f.run('repairNeedsAuth'),false);assert.equal(f.run('submittedPayload.registro_session'),'session-A');f.assertFiles();
});

test('OTP02 negative: another valid session after a generic 400 still cannot re-key or resend that cached attempt',async()=>{
  const f=fixture(async path=>{
    if(path==='/api/registro')return {status:400,data:{ok:false,error:'No se pudo guardar el registro'}};
    if(path==='/api/otp/verificar')return {data:{ok:true,registro_session:'session-B'}};
    if(path==='/api/registro/nova-retomar')return {data:{ok:true,found:false}};
    throw Error('No new quality work expected '+path);
  });
  completeForm(f);verified(f);await f.nodes.get('formRegistro').fire('submit');
  f.run('invalidarSesionOtp();');f.nodes.get('codigoOtp').value='123456';await f.click('btnVerificarOtp');await f.nodes.get('formRegistro').fire('submit');
  assert.equal(f.run('submittedPayload.registro_session'),'session-A');assert.equal(f.run('repairRegistrationBlocked'),true);
  assert.equal(f.calls.filter(c=>c.path==='/api/registro').length,1);f.assertFiles();
});

test('OTP02: a lost registration response retries the exact original payload and never refreshes photo review',async()=>{
  let registrations=0;const f=fixture(async path=>{
    assert.equal(path,'/api/registro','No extra quality/OTP/network operations allowed');
    if(++registrations===1)throw Error('Synthetic accepted response lost');return {status:503,data:{ok:false}};
  });
  completeForm(f);verified(f);await f.nodes.get('formRegistro').fire('submit');
  f.nodes.get('nombreCompleto').value='Cambio después del envío';f.run('qualityExpiresAt=0;photoQualityReceipt=null;evaluarSubmit();');
  await f.nodes.get('formRegistro').fire('submit');assert.equal(f.calls.length,2);assert.deepEqual(f.calls[1].body,f.calls[0].body);
  assert.equal(f.run('repairRegistrationUncertain'),true);assert.equal(f.run('repairCheck.hidden'),false);f.assertFiles();
});

test('OTP02: after an unknown send expires, fresh auth plus found:false cannot authorize a new registration or mutate its payload',async()=>{
  let registrations=0;const f=fixture(async path=>{
    if(path==='/api/registro'){if(++registrations===1)throw Error('Synthetic response lost');return expiredRegistration;}
    if(path==='/api/otp/verificar')return {data:{ok:true,registro_session:'session-B'}};
    if(path==='/api/registro/nova-retomar')return {data:{ok:true,found:false}};
    throw Error('No new quality or registration allowed '+path);
  });
  completeForm(f);verified(f);await f.nodes.get('formRegistro').fire('submit');await f.nodes.get('formRegistro').fire('submit');
  assert.equal(f.run('repairPayloadMayRenew'),false);await f.run('repairAuth.fire("click")');f.nodes.get('codigoOtp').value='123456';await f.click('btnVerificarOtp');
  assert.equal(f.run('registroSession'),'session-B');assert.equal(f.run('submittedPayload.registro_session'),'session-A');assert.equal(f.nodes.get('btnSubmit').disabled,true);
  await f.run('repairCheck.fire("click")');await f.nodes.get('formRegistro').fire('submit');
  assert.equal(registrations,2);assert.equal(f.calls.filter(c=>c.path==='/api/registro/nova-calidad-fotos').length,0);f.assertFiles();
});

test('OTP02: an uncertain accepted registration found on lookup resumes the same source with no second registration',async()=>{
  const f=fixture(async path=>{
    if(path==='/api/registro')throw Error('Synthetic response lost after commit');
    if(path==='/api/registro/nova-retomar')return {data:{ok:true,found:true,incomplete:true,quality_session:'same-original-source',name:'Persona de prueba',savedTypes:['frente','selfie']}};
    throw Error('No extra work before explicit Save '+path);
  });
  completeForm(f);verified(f);await f.nodes.get('formRegistro').fire('submit');await f.run('repairCheck.fire("click")');
  assert.equal(f.run('registroSession'),'same-original-source');assert.equal(f.run('repairRegistrationUncertain'),false);
  assert.equal(f.run('recoveryMode'),true);assert.equal(f.calls.filter(c=>c.path==='/api/registro').length,1);
  assert.equal(f.calls.filter(c=>c.path==='/api/registro/nova-calidad-fotos').length,0);f.assertFiles();
});

test('OTP02 negative: an unknown prior send followed by 422 does not discard cached idempotence',async()=>{
  let sends=0;const f=fixture(async path=>{assert.equal(path,'/api/registro');if(++sends===1)throw Error('Synthetic lost response');return {status:422,data:{ok:false}};});
  completeForm(f);verified(f);await f.nodes.get('formRegistro').fire('submit');await f.nodes.get('formRegistro').fire('submit');
  assert.equal(f.run('submittedPayload.registro_session'),'session-A');assert.equal(f.run('repairRegistrationBlocked'),true);assert.equal(f.run('repairRegistrationUncertain'),true);f.assertFiles();
});

test('OTP-L01: correcting a verified managed identity releases only that terminal challenge, preserves Files and does not resend automatically',async()=>{
  const f=fixture(async(path,body)=>{
    if(path==='/api/otp/opciones')return {data:{smsEnabled:true}};
    if(path==='/api/otp/enviar')return {data:{ok:true,request_id:body.request_id,channel:body.channel,otp_id:'11111111-1111-4111-8111-111111111111',state:'accepted'}};
    if(path==='/api/otp/verificar')return {data:{ok:true,registro_session:'managed-session-A'}};
    if(path==='/api/registro/nova-retomar')return {data:{ok:true,found:false}};
    throw Error('Unhandled mock '+path);
  });
  completeForm(f);await f.enable();await f.click('btnEnviarOtpSms');f.nodes.get('codigoOtp').value='123456';await f.click('btnVerificarOtp');
  assert.equal(f.run('otpManagedAttempt.state'),'verified');f.nodes.get('cedula').value='87654321';await f.nodes.get('cedula').fire('input');f.captcha();
  assert.equal(f.run('otpManagedAttempt'),null);assert.equal(f.run('otpVerificado'),false);assert.equal(f.run('registroSession'),null);
  assert.equal(f.run('photoQualityReceipt'),null);assert.equal(f.run('qualityExpiresAt'),0);
  assert.equal(f.nodes.get('btnEnviarOtp').disabled,false);assert.equal(f.nodes.get('btnEnviarOtpSms').hidden,false);assert.equal(f.calls.filter(c=>c.path==='/api/otp/enviar').length,1);f.assertFiles();
});

test('OTP-L01 negative: editing while a managed send is uncertain never releases the active guard or creates another send',async()=>{
  const f=fixture(async path=>{
    if(path==='/api/otp/opciones')return {data:{smsEnabled:true}};
    if(path==='/api/otp/enviar')throw Error('Synthetic send result uncertain');
    throw Error('Unhandled mock '+path);
  });
  completeForm(f);await f.enable();await f.click('btnEnviarOtpSms');f.nodes.get('cedula').value='87654321';await f.nodes.get('cedula').fire('input');f.captcha();
  assert.equal(f.run('otpManagedAttempt.state'),'uncertain');assert.equal(f.nodes.get('btnEnviarOtp').disabled,true);await f.click('btnEnviarOtp');
  assert.equal(f.calls.filter(c=>c.path==='/api/otp/enviar').length,1);f.assertFiles();
});

for(const [state,showCode]of [['accepted',true],['uncertain',false],['reserved',false]])test('OTP03 UI: legacy 202 '+state+' is truthful and never sends a second request automatically',async()=>{
  const f=fixture(async path=>{assert.equal(path,'/api/otp/enviar');return {status:202,data:{ok:false,pending:true,state,retry_after:300}};});
  completeForm(f);f.captcha();await f.click('btnEnviarOtp');
  assert.equal(f.nodes.get('codeRow').classList.contains('show'),showCode);assert.equal(f.calls.length,1);
  assert.doesNotMatch(f.nodes.get('otpStatus').textContent,/Código enviado|entregado|leído/);
  assert.match(f.nodes.get('otpStatus').textContent,showCode?/Si lo recibiste/:/no está confirmado/);f.assertFiles();
});

test('OTP03 UI negative: another active identity exposes no challenge details and does not offer code entry',async()=>{
  const f=fixture(async path=>{assert.equal(path,'/api/otp/enviar');return {status:409,data:{ok:false,reason:'active_challenge',retry_after:300}};});
  completeForm(f);f.captcha();await f.click('btnEnviarOtp');assert.equal(f.calls.length,1);
  assert.equal(f.nodes.get('codeRow').classList.contains('show'),false);assert.match(f.nodes.get('otpStatus').textContent,/verificación en curso/);f.assertFiles();
});

test('baseline→candidate PHOTO01: the same expired upload proof changes from repeated stale requests to in-page recovery',async()=>{
  const observations=[];
  for(const base of [true,false]){
    const f=fixture(async path=>{assert.equal(path,'/api/documentos');return expiredDocuments;},{base});
    completeForm(f);verified(f);f.run("documentosSession='expired';uploadedTypes.add('frente');form.classList.add('form-hidden');");
    await f.run('manejarFotosPostRegistro()');await f.nodes.get('btnReintentarFotos').fire('click');
    observations.push({count:f.calls.length,hidden:f.nodes.get('formRegistro').classList.contains('form-hidden')});f.assertFiles();
  }
  assert.deepEqual(observations,[{count:4,hidden:true},{count:2,hidden:false}]);
});

test('baseline→candidate PHOTO02: the same Save race uploads stale A only in the baseline',async()=>{
  const observations=[];
  for(const base of [true,false]){
    let finish;const uploads=[];const f=fixture(async(path,body)=>{
      if(path==='/api/otp/verificar')return {data:{ok:true,registro_session:'auth'}};
      if(path==='/api/registro/nova-retomar')return {data:{ok:true,found:true,incomplete:true,quality_session:'source',name:'Persona de prueba',savedTypes:['reverso','selfie']}};
      if(path==='/api/registro/nova-calidad-fotos')return new Promise(done=>{finish=()=>done(quality('receipt-A','documents-A'));});
      if(path==='/api/documentos'){uploads.push(body);return {data:{ok:true}};}
      if(path==='/api/registro/nova-estado')return {data:{ok:true,nova_status:'review_required'}};
      throw Error('Unhandled mock '+path);
    },{base});
    completeForm(f);verified(f);f.nodes.get('codigoOtp').value='123456';await f.click('btnVerificarOtp');
    f.run("qualityBlobCache.set(document.getElementById('fotoFrente').files[0],'photo-A');photoQualityReceipt=null;qualityExpiresAt=0;");
    const pending=f.run(base?"form.afterNodes[0].children.find(e=>e.textContent==='Guardar fotos pendientes').onclick()":'repairRecoverySave.fire("click")');
    await Promise.resolve();await Promise.resolve();const locked=f.nodes.get('fotoFrente').disabled;
    const b=new File(['synthetic-B'],'B.jpg',{type:'image/jpeg'});f.nodes.get('fotoFrente').files=[b];f.context.b=b;f.run("qualityBlobCache.set(b,'photo-B');");await f.nodes.get('fotoFrente').fire('change');finish();await pending;
    assert.equal(f.nodes.get('fotoFrente').files[0],b);observations.push({locked,staleUploaded:uploads.some(p=>p.foto_base64==='photo-A')});
  }
  assert.deepEqual(observations,[{locked:false,staleUploaded:true},{locked:true,staleUploaded:false}]);
});

test('baseline→candidate OTP01: the exact same delayed verify cannot bind session A to identity B in the candidate',async()=>{
  const badStates=[];
  for(const base of [true,false]){
    let finish;const f=fixture(async path=>{
      if(path==='/api/otp/verificar')return new Promise(done=>{finish=()=>done({data:{ok:true,registro_session:'server-session-A'}});});
      if(path==='/api/registro/nova-retomar')return {data:{ok:true,found:false}};
      throw Error('Unhandled mock '+path);
    },{base});
    completeForm(f);f.nodes.get('codigoOtp').value='123456';const pending=f.click('btnVerificarOtp');f.nodes.get('cedula').value='87654321';await f.nodes.get('cedula').fire('input');finish();await pending;
    badStates.push(f.run("otpVerificado&&registroSession==='server-session-A'&&cedulaVerificada==='87654321'"));f.assertFiles();
  }
  assert.deepEqual(badStates,[true,false]);
});

test('baseline→candidate OTP02: exact expired-session rejection recovers session B only in the candidate',async()=>{
  const sessions=[];
  for(const base of [true,false]){
    const f=fixture(async(path,body)=>{
      if(path==='/api/registro')return body.registro_session==='session-A'?expiredRegistration:{data:{ok:true,documentos_session:'documents-B'}};
      if(path==='/api/otp/verificar')return {data:{ok:true,registro_session:'session-B'}};
      if(path==='/api/registro/nova-retomar')return {data:{ok:true,found:false}};
      if(path==='/api/registro/nova-calidad-fotos')return quality();
      if(path==='/api/documentos')return {data:{ok:true}};
      if(path==='/api/registro/nova-estado')return {data:{ok:true,nova_status:'review_required'}};
      throw Error('Unhandled mock '+path);
    },{base});
    completeForm(f);verified(f);await f.nodes.get('formRegistro').fire('submit');f.nodes.get('codigoOtp').value='123456';await f.click('btnVerificarOtp');await f.nodes.get('formRegistro').fire('submit');
    sessions.push(f.calls.filter(c=>c.path==='/api/registro')[1].body.registro_session);f.assertFiles();
  }
  assert.deepEqual(sessions,['session-A','session-B']);
});

test('baseline→candidate OTP-L01: correcting the terminal managed identity is blocked only in the baseline',async()=>{
  const locked=[];
  for(const base of [true,false]){
    const f=fixture(async(path,body)=>{
      if(path==='/api/otp/opciones')return {data:{smsEnabled:true}};
      if(path==='/api/otp/enviar')return {data:{ok:true,request_id:body.request_id,channel:body.channel,otp_id:'11111111-1111-4111-8111-111111111111',state:'accepted'}};
      if(path==='/api/otp/verificar')return {data:{ok:true,registro_session:'managed-A'}};
      if(path==='/api/registro/nova-retomar')return {data:{ok:true,found:false}};
      throw Error('Unhandled mock '+path);
    },{base});
    completeForm(f);await f.enable();await f.click('btnEnviarOtpSms');f.nodes.get('codigoOtp').value='123456';await f.click('btnVerificarOtp');
    f.nodes.get('cedula').value='87654321';await f.nodes.get('cedula').fire('input');f.captcha();locked.push(f.nodes.get('btnEnviarOtp').disabled);f.assertFiles();
  }
  assert.deepEqual(locked,[true,false]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {baseline,candidate,fixture} from './form-harness.mjs';
import {transformForm,FORM_BASE_SHA256} from './transform.mjs';

const sends=f=>f.calls.filter(c=>c.path==='/api/otp/enviar');
const statusReads=f=>f.calls.filter(c=>c.path==='/api/otp/estado-whatsapp');
const sendAccepted={data:{ok:true,state:'accepted',retry_after:300}};
const failed={data:{ok:false,state:'failed',error_code:'131026',retry_after:285}};
const route=reply=>async(path)=>{
  if(path==='/api/otp/enviar')return sendAccepted;
  if(path==='/api/otp/estado-whatsapp')return reply;
  throw Error('Unhandled closed mock '+path);
};

test('pins full production HTML, deterministic transform, double application rejected, scripts parse',()=>{
  assert.equal(createHash('sha256').update(baseline).digest('hex'),FORM_BASE_SHA256);
  assert.equal(transformForm(baseline),candidate);
  assert.throws(()=>transformForm(candidate),/BASELINE_DRIFT/);
  assert.throws(()=>transformForm(baseline+'\n'),/BASELINE_DRIFT/);
  for(const m of candidate.matchAll(/<script>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new Function(m[1]));
  assert.equal(candidate.includes('form.reset('),false);
});

test('accepted means accepted, does not claim delivery, starts status-only read without another send',async()=>{
  const f=fixture(route({data:{ok:true,state:'accepted',retry_after:295}}));
  await f.click('btnEnviarOtp');
  assert.match(f.nodes.get('otpStatus').textContent,/todavía no confirmó la entrega/);
  assert.equal(f.nodes.get('codeRow').classList.contains('show'),true);
  assert.equal(sends(f).length,1);assert.equal(statusReads(f).length,0);
  await f.advance(1000);
  assert.equal(statusReads(f).length,1);assert.equal(sends(f).length,1);
  assert.deepEqual(Object.keys(statusReads(f)[0].body).sort(),['cedula','celular','enlace_token']);
  f.assertFiles();
});

test('failed delivery hides rejected code, gives concrete action and keeps identity, selected File objects and all other fields',async()=>{
  const f=fixture(route(failed));
  f.nodes.get('direccion').value='Dirección ficticia';f.nodes.get('email').value='persona@example.invalid';
  await f.click('btnEnviarOtp');await f.advance(1000);
  assert.match(f.nodes.get('otpStatus').textContent,/no pudo entregar.*131026/);
  assert.match(f.nodes.get('otpStatus').textContent,/celular sea tuyo y tenga WhatsApp activo/);
  assert.match(f.nodes.get('otpStatus').textContent,/solicitar otro código en 285 s/);
  assert.doesNotMatch(f.nodes.get('otpStatus').textContent,/espera.*código rechazado|Si lo recibiste|Ingresa el código/);
  assert.equal(f.nodes.get('codeRow').classList.contains('show'),false);
  assert.equal(f.nodes.get('btnVerificarOtp').disabled,true);
  assert.equal(f.nodes.get('cedula').value,'12345678');assert.equal(f.nodes.get('celular').value,'3000000000');
  assert.equal(f.nodes.get('direccion').value,'Dirección ficticia');assert.equal(f.nodes.get('email').value,'persona@example.invalid');
  f.assertFiles();assert.equal(f.nodes.get('btnEnviarOtpSms').hidden,true);
});

test('failed countdown ends without automatic send and requires fresh CAPTCHA before next eligible click',async()=>{
  const f=fixture(route({data:{state:'failed',error_code:'131026',retry_after:20}}));
  await f.click('btnEnviarOtp');await f.advance(1000);f.captcha();
  assert.equal(f.nodes.get('btnEnviarOtp').disabled,true);
  await f.advance(20000);
  assert.equal(sends(f).length,1);assert.equal(f.nodes.get('btnEnviarOtp').disabled,false);
  assert.match(f.nodes.get('otpStatus').textContent,/Puedes solicitar otro código después/);
  assert.equal(statusReads(f).length,1,'Failure stops status requests; only a local countdown remains');
  await f.click('btnEnviarOtp');assert.equal(sends(f).length,2,'Only explicit click makes the second request');
  assert.equal(f.run('turnstileToken'),null);f.assertFiles();
});

test('expiry permits no automatic retry and a renewed CAPTCHA is still required',async()=>{
  const f=fixture(route({data:{state:'accepted',retry_after:5}}));
  await f.click('btnEnviarOtp');await f.advance(1000);await f.advance(5000);
  assert.match(f.nodes.get('otpStatus').textContent,/código venció/);
  assert.equal(f.nodes.get('codeRow').classList.contains('show'),false);
  assert.equal(sends(f).length,1);assert.equal(f.nodes.get('btnEnviarOtp').disabled,true);
  f.captcha();assert.equal(f.nodes.get('btnEnviarOtp').disabled,false);f.assertFiles();
});

test('changing phone during status read discards old response and preserves Files',async()=>{
  let release;const f=fixture(async(path)=>{
    if(path==='/api/otp/enviar')return sendAccepted;
    if(path==='/api/otp/estado-whatsapp')return new Promise(done=>{release=()=>done(failed);});
    throw Error('Unhandled closed mock '+path);
  });
  await f.click('btnEnviarOtp');const checking=f.advance(1000);await Promise.resolve();
  f.nodes.get('celular').value='3000000001';await f.nodes.get('celular').fire('input');
  release();await checking;
  assert.equal(f.run('legacyWaAttempt'),null);
  assert.doesNotMatch(f.nodes.get('otpStatus').textContent,/131026/);
  assert.equal(f.nodes.get('codeRow').classList.contains('show'),false);f.assertFiles();
});

test('changing identity during initial send discards the old accepted response',async()=>{
  let release;const f=fixture(async(path)=>{
    if(path==='/api/otp/enviar')return new Promise(done=>{release=()=>done(sendAccepted);});
    throw Error('No status request expected '+path);
  });
  const sending=f.click('btnEnviarOtp');await Promise.resolve();
  f.nodes.get('cedula').value='12345679';await f.nodes.get('cedula').fire('input');
  release();await sending;
  assert.equal(f.run('legacyWaAttempt'),null);
  assert.equal(f.nodes.get('codeRow').classList.contains('show'),false);
  await f.advance(10000);assert.equal(statusReads(f).length,0);f.assertFiles();
});

test('transport and HTTP status uncertainty do not claim acceptance or resend',async()=>{
  let count=0;const f=fixture(async(path)=>{
    if(path==='/api/otp/enviar')return sendAccepted;
    if(path==='/api/otp/estado-whatsapp'){if(++count===1)throw Error('offline');return {status:503,data:{ok:false}};}
    throw Error('Unhandled '+path);
  });
  await f.click('btnEnviarOtp');await f.advance(1000);
  assert.equal(f.run('legacyWaAttempt.state'),'uncertain');assert.match(f.nodes.get('otpStatus').textContent,/no se confirmó el resultado/);
  assert.equal(f.nodes.get('codeRow').classList.contains('show'),false);
  await f.advance(8000);assert.equal(statusReads(f).length,2);assert.equal(sends(f).length,1);f.assertFiles();
});

test('polling is bounded at most5min and at8s intervals with no CAPTCHA or customer write calls',async()=>{
  const f=fixture(route({data:{state:'uncertain',retry_after:300}}));
  await f.click('btnEnviarOtp');await f.advance(1000);
  for(let i=0;i<45;i++)await f.advance(8000);
  const count=statusReads(f).length;assert.ok(count<=38);
  await f.advance(600000);assert.equal(statusReads(f).length,count);
  assert.equal(sends(f).length,1);
  assert.equal(f.calls.filter(c=>!['/api/otp/enviar','/api/otp/estado-whatsapp'].includes(c.path)).length,0);f.assertFiles();
});

test('a late acceptance cannot revive an already failed attempt or extend its original expiry',async()=>{
  const f=fixture(route(failed));await f.click('btnEnviarOtp');await f.advance(1000);
  const deadline=f.run('legacyWaAttempt.lockUntil');
  f.run("legacyWaApply(legacyWaAttempt,{state:'accepted',retry_after:300})");
  assert.equal(f.run('legacyWaAttempt.state'),'failed');assert.equal(f.run('legacyWaAttempt.lockUntil'),deadline);
  f.assertFiles();
});

test('verification busy suppresses status application and resumes reading after completion',async()=>{
  let release;const f=fixture(async(path)=>{
    if(path==='/api/otp/enviar')return sendAccepted;
    if(path==='/api/otp/estado-whatsapp')return new Promise(done=>{release=()=>done(failed);});
    throw Error('Unhandled '+path);
  });
  await f.click('btnEnviarOtp');const pending=f.advance(1000);await Promise.resolve();
  f.run('repairVerificationBusy=true;');release();await pending;
  assert.equal(f.run('legacyWaAttempt.state'),'accepted');
  f.run('repairVerificationBusy=false;');
  const again=f.advance(8000);await Promise.resolve();release();await again;
  assert.equal(f.run('legacyWaAttempt.state'),'failed');f.assertFiles();
});

test('another-tab verification never invents a local verified session or enables resend',async()=>{
  const f=fixture(route({data:{state:'verified',retry_after:0}}));
  await f.click('btnEnviarOtp');await f.advance(1000);f.captcha();
  assert.equal(f.run('registroSession'),null);assert.equal(f.run('otpVerificado'),false);
  assert.equal(f.nodes.get('btnEnviarOtp').disabled,true);
  assert.match(f.nodes.get('otpStatus').textContent,/formulario donde verificaste/);f.assertFiles();
});

test('202 accepted recovery consults status and reports failure instead of another delivery wait',async()=>{
  const f=fixture(async path=>{
    if(path==='/api/otp/enviar')return {status:202,data:{ok:false,pending:true,state:'accepted',retry_after:60}};
    if(path==='/api/otp/estado-whatsapp')return {data:{state:'failed',error_code:'131026',retry_after:59}};
    throw Error('Unhandled '+path);
  });
  await f.click('btnEnviarOtp');await f.advance(1000);
  assert.match(f.nodes.get('otpStatus').textContent,/no pudo entregar/);
  assert.equal(f.nodes.get('codeRow').classList.contains('show'),false);
  assert.equal(sends(f).length,1);f.assertFiles();
});

test('quota errors remain truthful through polling and do not claim that a code was requested',async()=>{
  const f=fixture(async path=>{
    if(path==='/api/otp/enviar')return {status:429,data:{ok:false,error:'quota'}};
    if(path==='/api/otp/estado-whatsapp')return {data:{state:'not_found',retry_after:300}};
    throw Error('Unhandled '+path);
  });
  await f.click('btnEnviarOtp');assert.match(f.nodes.get('otpStatus').textContent,/límite de solicitudes/);
  await f.advance(1000);assert.match(f.nodes.get('otpStatus').textContent,/límite de solicitudes/);
  assert.equal(f.nodes.get('codeRow').classList.contains('show'),false);assert.equal(sends(f).length,1);f.assertFiles();
});

test('successful verification ends status polling and preserves the verified session',async()=>{
  const f=fixture(async path=>{
    if(path==='/api/otp/enviar')return sendAccepted;
    if(path==='/api/otp/verificar')return {data:{ok:true,registro_session:'synthetic-session'}};
    if(path==='/api/registro/nova-retomar')return {data:{ok:true,found:false}};
    throw Error('No status read expected after verification '+path);
  });
  await f.click('btnEnviarOtp');f.nodes.get('codigoOtp').value='123456';await f.click('btnVerificarOtp');
  assert.equal(f.run('otpVerificado'),true);assert.equal(f.run('registroSession'),'synthetic-session');
  assert.equal(f.calls.find(c=>c.path==='/api/otp/verificar').body.attempt_id,undefined,'Older unbound attempts keep compatibility');
  await f.advance(10000);assert.equal(statusReads(f).length,0);assert.equal(sends(f).length,1);f.assertFiles();
});

test('status is pinned to the original attempt and ignores a newer attempt for the same identity',async()=>{
  const first='11111111-1111-4111-8111-111111111111',newer='22222222-2222-4222-8222-222222222222';
  let count=0;const f=fixture(async(path,body)=>{
    if(path==='/api/otp/enviar')return {data:{ok:true,state:'accepted',retry_after:300,attempt_id:first}};
    if(path==='/api/otp/estado-whatsapp'){
      assert.equal(body.attempt_id,first);
      if(++count===1)return {data:{state:'failed',error_code:'131026',retry_after:290,attempt_id:newer}};
      if(count===2)return {data:{state:'failed',error_code:'131026',retry_after:280}};
      return {data:{state:'failed',error_code:'131026',retry_after:270,attempt_id:first}};
    }
    throw Error('Unhandled '+path);
  });
  await f.click('btnEnviarOtp');assert.equal(f.run('legacyWaAttempt.attemptId'),first);
  await f.advance(1000);
  assert.equal(f.run('legacyWaAttempt.state'),'accepted');assert.doesNotMatch(f.nodes.get('otpStatus').textContent,/131026/);
  await f.advance(8000);assert.equal(f.run('legacyWaAttempt.state'),'accepted','Missing ID cannot replace a bound receipt');
  await f.advance(8000);assert.equal(f.run('legacyWaAttempt.state'),'failed');
  assert.match(f.nodes.get('otpStatus').textContent,/131026/);assert.equal(sends(f).length,1);f.assertFiles();
});

test('a local network failure keeps its bound attempt ID and never applies another server response',async()=>{
  const first='11111111-1111-4111-8111-111111111111';let count=0;
  const f=fixture(async(path,body)=>{
    if(path==='/api/otp/enviar')return {data:{ok:true,state:'accepted',retry_after:300,attempt_id:first}};
    if(path==='/api/otp/estado-whatsapp'){
      assert.equal(body.attempt_id,first);
      if(++count===1)throw Error('offline');
      return {data:{state:'accepted',retry_after:290,attempt_id:first}};
    }
    throw Error('Unhandled '+path);
  });
  await f.click('btnEnviarOtp');await f.advance(1000);
  assert.equal(f.run('legacyWaAttempt.attemptId'),first);assert.equal(f.run('legacyWaAttempt.state'),'uncertain');
  await f.advance(8000);assert.equal(f.run('legacyWaAttempt.state'),'accepted');assert.equal(sends(f).length,1);f.assertFiles();
});

test('invalid attempt identifiers cannot pin a receipt or disclose provider IDs through later requests',async()=>{
  const f=fixture(route({data:{state:'failed',error_code:'131026',retry_after:290,attempt_id:'wamid.provider-id'}}));
  await f.click('btnEnviarOtp');await f.advance(1000);
  assert.equal(f.run('legacyWaAttempt.attemptId'),null);assert.equal(f.run('legacyWaAttempt.state'),'accepted');
  assert.equal(statusReads(f)[0].body.attempt_id,undefined);f.assertFiles();
});

test('legacy verification sends the bound attempt ID alongside the exact identity',async()=>{
  const first='11111111-1111-4111-8111-111111111111';
  const f=fixture(async(path,body)=>{
    if(path==='/api/otp/enviar')return {data:{ok:true,state:'accepted',retry_after:300,attempt_id:first}};
    if(path==='/api/otp/verificar'){
      assert.equal(body.attempt_id,first);assert.equal(body.cedula,'12345678');assert.equal(body.celular,'3000000000');
      return {status:400,data:{ok:false}};
    }
    throw Error('Unhandled '+path);
  });
  await f.click('btnEnviarOtp');f.nodes.get('codigoOtp').value='123456';await f.click('btnVerificarOtp');
  assert.equal(f.calls.filter(c=>c.path==='/api/otp/verificar').length,1);assert.equal(sends(f).length,1);f.assertFiles();
});

test('managed verification does not inherit a legacy delivery attempt ID',async()=>{
  const first='11111111-1111-4111-8111-111111111111';
  const f=fixture(async(path,body)=>{
    if(path==='/api/otp/enviar')return {data:{ok:true,state:'accepted',retry_after:300,attempt_id:first}};
    if(path==='/api/otp/verificar'){assert.equal(body.attempt_id,undefined);return {status:400,data:{ok:false}};}
    throw Error('Unhandled '+path);
  });
  await f.click('btnEnviarOtp');
  f.run("smsOtpEnabled=true;otpManagedAttempt={requestId:'22222222-2222-4222-8222-222222222222',channel:'sms',state:'accepted',cedula:document.getElementById('cedula').value,celular:celularInput.value,lockUntil:Date.now()+300000};renderOtpGestionado();");
  f.nodes.get('codigoOtp').value='123456';await f.click('btnVerificarOtp');
  assert.equal(f.calls.filter(c=>c.path==='/api/otp/verificar').length,1);f.assertFiles();
});

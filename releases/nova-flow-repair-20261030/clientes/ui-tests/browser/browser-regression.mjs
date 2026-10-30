import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { candidate, baseline } from '../form-harness.mjs';

// Uses an already installed Playwright package. It never installs or downloads a browser.
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const evidence=new URL('./evidence/',import.meta.url);await mkdir(evidence,{recursive:true});
const profile=await mkdtemp('/private/tmp/nova-flow-chrome-');
const origin='https://nova-local.invalid';
const network=[],unexpected=[],pageErrors=[],results=[];
const sha=value=>createHash('sha256').update(value).digest('hex');

const bootstrap=String.raw`(() => {
 const now=Date.now.bind(Date);Date.now=()=>now()+window.__mock.shift;
 window.__mock={shift:0,sms:false,sendState:'accepted',pending:false,documentsExpired:false,holdQuality:false,qualityHeld:false,calls:[],unexpected:[],resume:{ok:true,found:false},files:[],inputs:[]};
 const m=window.__mock,own=id=>document.getElementById(id);
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
 const states={frente:{status:'auto_approved'},reverso:{status:'auto_approved'},selfie:{status:'auto_approved'}};
 let verify=0,quality=0,securityCallback;
 window.fetch=async(input,options={})=>{
  const u=new URL(typeof input==='string'?input:input.url,location.href),body=options.body?JSON.parse(options.body):{};
  if(u.origin!=='https://creditek-clientes.comercial-853.workers.dev'){m.unexpected.push(u.origin);throw Error('External request forbidden');}
  m.calls.push({path:u.pathname,body});
  if(u.pathname==='/api/registro/contexto')return reply({contexto:{origen:{codigo:'CK-01',nombre:'TIENDA PRUEBA LOCAL · SIN ENVÍOS'},tipo:'personal',captadores:[{id:'synthetic-seller',nombre:'Vendedor ficticio'}]}});
  if(u.pathname==='/api/registro/config')return reply({nova_registration:{enabled:true,policy_hash:'e482ba5840a84938043c159e6787f07fb8748bf2e784b4e56946991d5de4af11',text_version:'nova-pilot-20260915-v1',retail_enabled:true},turnstile_site_key:'mock-only'});
  if(u.pathname==='/api/otp/opciones')return reply({smsEnabled:m.sms});
  if(u.pathname==='/api/otp/enviar'){
   if(m.pending)return reply({ok:false,pending:true,state:m.sendState,retry_after:300},202);
   return reply(body.request_id?{ok:true,request_id:body.request_id,channel:body.channel,otp_id:'11111111-1111-4111-8111-111111111111',state:'accepted'}:{ok:true});
  }
  if(u.pathname==='/api/otp/verificar')return reply({ok:true,registro_session:btoa(JSON.stringify({purpose:'registro',exp:Date.now()+1800000,fixture:++verify}))+'.synthetic-not-a-signature'});
  if(u.pathname==='/api/registro/nova-retomar')return reply(m.resume);
  if(u.pathname==='/api/registro/nova-calidad-fotos'){
   if(body.partial===true&&!body.request_receipt)return reply({ok:true,partial:true,photoStates:states});
   const response={ok:true,receipt:'synthetic-receipt-'+(++quality),expiresAt:Date.now()+1200000,documentos_session:'synthetic-documents-'+quality,photoStates:states};
   if(m.holdQuality){m.qualityHeld=true;return new Promise(resolve=>{m.releaseQuality=()=>{m.qualityHeld=false;resolve(reply(response));};});}
   return reply(response);
  }
  if(u.pathname==='/api/documentos')return m.documentsExpired?reply({ok:false,error:'Sesión de documentos inválida o vencida'},400):reply({ok:true});
  if(u.pathname==='/api/registro/nova-estado')return reply({ok:true,nova_status:'review_required'});
  m.unexpected.push(u.pathname);throw Error('No live endpoint reachable');
 };
 window.turnstile={render(_selector,options){securityCallback=options.callback;own('turnstileContainer').textContent='Turnstile simulado · sin conexión externa';queueMicrotask(()=>securityCallback('synthetic-turnstile'));return 1;},reset(){queueMicrotask(()=>securityCallback?.('synthetic-turnstile'));}};
 window.__fixtureFiles=()=>{
  const ids=['fotoFrente','fotoReverso','fotoSelfie'];
  ids.forEach((id,i)=>{const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;const ctx=canvas.getContext('2d');ctx.fillStyle=['#ff0000','#00ff00','#0000ff'][i];ctx.fillRect(0,0,8,8);const bytes=Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0));const file=new File([bytes],'SINTETICA-'+id+'.png',{type:'image/png',lastModified:1}),dt=new DataTransfer();dt.items.add(file);const input=own(id);input.files=dt.files;m.files.push(input.files[0]);m.inputs.push(input);input.dispatchEvent(new Event('change',{bubbles:true}));});
 };
 window.__filesPreserved=()=>['fotoFrente','fotoReverso','fotoSelfie'].every((id,i)=>own(id)===m.inputs[i]&&own(id).files[0]===m.files[i]);
 window.__replaceFront=()=>{const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;const ctx=canvas.getContext('2d');ctx.fillStyle='#ff00ff';ctx.fillRect(0,0,8,8);const bytes=Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0));const file=new File([bytes],'SINTETICA-foto-B.png',{type:'image/png',lastModified:2}),dt=new DataTransfer();dt.items.add(file);own('fotoFrente').files=dt.files;m.photoB=own('fotoFrente').files[0];own('fotoFrente').dispatchEvent(new Event('change',{bubbles:true}));};
})();`;

let html=candidate.replace(/<base\b[^>]*>/g,'').replace(/<link\b[^>]*>/g,'').replace(/<script\b[^>]+src=[^>]*>\s*<\/script>/g,'');
html=html.replace('<head>','<head><script>'+bootstrap+'</script>');
html=html.replace('<body>','<body><aside style="max-width:640px;margin:16px auto;padding:16px;border:3px solid #087e8b;font:16px system-ui;background:white"><strong>PRUEBA LOCAL · SIN ENVÍOS</strong><p>Datos y fotos sintéticos. OTP, proveedor, OCR y todos los endpoints están simulados. No se contacta ningún servicio real.</p></aside>');

const context=await chromium.launchPersistentContext(profile,{
 executablePath:process.env.CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 headless:true,viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:false,
 args:['--disable-background-networking','--disable-component-update','--disable-default-apps','--no-first-run','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND'],
});
try{
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());network.push({origin:url.origin,path:url.pathname,type:request.resourceType()});
  if(url.origin===origin&&request.resourceType()==='document')return route.fulfill({status:200,contentType:'text/html; charset=utf-8',headers:{'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'; media-src blob:"},body:html});
  if(url.origin===origin&&url.pathname==='/favicon.ico')return route.fulfill({status:204,body:''});
  unexpected.push({origin:url.origin,path:url.pathname,type:request.resourceType()});await route.abort();
 });
 const setup=async({sms=false,resume={ok:true,found:false},documentsExpired=false}={})=>{
  const page=await context.newPage();page.on('pageerror',error=>pageErrors.push(error.message));await page.goto(origin+'/?t=synthetic-link');
  await page.waitForFunction(()=>contextoValido&&!!turnstileToken);
  await page.evaluate(({sms,resume,documentsExpired})=>Object.assign(__mock,{sms,resume,documentsExpired}),{sms,resume,documentsExpired});
  await page.locator('#cedula').fill('12345678');await page.locator('#nombreCompleto').fill('Persona de prueba');await page.locator('#celular').fill('3000000000');
  for(const [id,value]of Object.entries({ciudad:'Ciudad sintética',direccion:'Dirección sintética',productoInteres:'Equipo de prueba',ref1Nombre:'Referencia Uno',ref1Telefono:'3000000001',ref2Nombre:'Referencia Dos',ref2Telefono:'3000000002'}))await page.locator('#'+id).fill(value);
  await page.locator('#autDatos').check();await page.locator('#autReferencias').check();await page.locator('#autPhotoQuality').check();
  await page.evaluate(()=>__fixtureFiles());
  await page.waitForFunction(()=>!qualityBusy&&!reviewPending);
  if(sms)await page.waitForFunction(()=>smsOtpEnabled&&smsOtpAllowed&&!document.getElementById('btnEnviarOtpSms').disabled);
  return page;
 };
 const verify=async(page,{sms=false}={})=>{
  await page.locator(sms?'#btnEnviarOtpSms':'#btnEnviarOtp').click();await page.locator('#codigoOtp').fill('123456');await page.locator('#btnVerificarOtp').click();
  await page.waitForFunction(()=>!repairVerificationBusy&&!qualityBusy&&!reviewPending);
 };
 const capture=async(page,name)=>{await page.screenshot({path:fileURLToPath(new URL(name+'.png',evidence)),fullPage:true});return 'evidence/'+name+'.png';};
 const geometry=async(page,key,{visibilityProbe=false}={})=>{
  const dimensions=await page.evaluate(({key,visibilityProbe})=>{
   const button={repairAuth,repairCheck,repairRecoverySave}[key],hidden=button.hidden;
   if(visibilityProbe)button.hidden=false;
   const r=button.getBoundingClientRect(),css=getComputedStyle(button);
   const result={button:key,height:r.height,width:r.width,left:r.left,right:r.right,viewportWidth:innerWidth,background:css.backgroundColor,color:css.color,visibilityProbe};
   button.hidden=hidden;return result;
  },{key,visibilityProbe});
  assert.ok(dimensions.height>=44,key+' must have a 44px touch target');
  assert.ok(dimensions.left>=0&&dimensions.right<=dimensions.viewportWidth&&dimensions.width<=dimensions.viewportWidth,key+' must fit the mobile viewport');return dimensions;
 };
 const calls=page=>page.evaluate(()=>__mock.calls.map(c=>({path:c.path,channel:c.body.channel||null,photoTypes:c.body.photos?Object.keys(c.body.photos):undefined,type:c.body.tipo||undefined})));

 // Expiration after a real UI Save. Both subsequent OTP requests are mocked.
 {
  const page=await setup({documentsExpired:true,resume:{ok:true,found:true,incomplete:true,quality_session:'synthetic-source-session',name:'Persona de prueba',savedTypes:['frente']}});
  await verify(page);const saveGeometry=await geometry(page,'repairRecoverySave');await page.getByRole('button',{name:'Guardar fotos pendientes',exact:true}).click();await page.waitForFunction(()=>repairNeedsAuth&&!qualityBusy&&!subidaFotosEnCurso);
  assert.equal(await page.evaluate(()=>__filesPreserved()),true);assert.match(await page.evaluate(()=>repairMessage.textContent),/sesión.*venció/i);
  const authGeometry=await geometry(page,'repairAuth'),checkGeometry=await geometry(page,'repairCheck',{visibilityProbe:true});
  const expired=await capture(page,'documents-expired-files-preserved');
  await page.evaluate(()=>{__mock.documentsExpired=false;__mock.shift+=16000;});
  await page.getByRole('button',{name:'Verificar celular sin perder mis fotos',exact:true}).click();await verify(page);
  await page.getByRole('button',{name:'Guardar fotos pendientes',exact:true}).click();await page.waitForFunction(()=>uploadedTypes.size===3&&!qualityBusy&&!subidaFotosEnCurso);
  const preserved=await page.evaluate(()=>({files:__filesPreserved(),name:document.getElementById('nombreCompleto').value,city:document.getElementById('ciudad').value,phone:document.getElementById('celular').value,cc:document.getElementById('cedula').value,panelCount:[...document.querySelectorAll('h2')].filter(h=>h.textContent==='Retomar fotos pendientes').length,registrationPosts:__mock.calls.filter(c=>c.path==='/api/registro').length,uploadedTypes:[...uploadedTypes],uploads:__mock.calls.filter(c=>c.path==='/api/documentos').map(c=>c.body.tipo)}));
  assert.equal(preserved.files,true);assert.equal(preserved.name,'Persona de prueba');assert.equal(preserved.city,'Ciudad sintética');assert.equal(preserved.phone,'3000000000');assert.equal(preserved.cc,'12345678');assert.equal(preserved.panelCount,1);assert.equal(preserved.registrationPosts,0);assert.equal(preserved.uploads.includes('frente'),false);
  results.push({case:'PHOTO01 real Chrome: expired documents → explicit OTP → same existing source',passed:true,...preserved,mobileButtonGeometry:[saveGeometry,authGeometry,checkGeometry],screenshots:[expired,await capture(page,'documents-resumed-same-files')],calls:await calls(page)});await page.close();
 }
 // Freeze all inputs; force a late programmatic B anyway and prove A cannot upload.
 {
  const page=await setup({resume:{ok:true,found:true,incomplete:true,quality_session:'synthetic-source',name:'Persona de prueba',savedTypes:['reverso','selfie']}});await verify(page);
  await page.evaluate(()=>{__mock.holdQuality=true;});await page.getByRole('button',{name:'Guardar fotos pendientes',exact:true}).click();await page.waitForFunction(()=>__mock.qualityHeld);
  assert.equal(await page.locator('#fotoFrente').isDisabled(),true);assert.equal(await page.locator('#autPhotoQuality').isDisabled(),true);
  const frozen=await capture(page,'save-review-inputs-frozen');await page.evaluate(()=>__replaceFront());await page.evaluate(()=>__mock.releaseQuality());
  await page.waitForFunction(()=>!qualityBusy);assert.equal(await page.evaluate(()=>__mock.calls.filter(c=>c.path==='/api/documentos').length),0);assert.equal(await page.evaluate(()=>document.getElementById('fotoFrente').files[0]===__mock.photoB),true);
  assert.equal(await page.evaluate(()=>repairRecoveryPanel.hidden),false);assert.equal(await page.evaluate(()=>photoQualityReceipt),null);
  await page.evaluate(()=>{__mock.holdQuality=false;});await page.getByRole('button',{name:'Guardar fotos pendientes',exact:true}).click();await page.waitForFunction(()=>uploadedTypes.size===3&&!qualityBusy);
  const proof=await page.evaluate(()=>{const reviews=__mock.calls.filter(c=>c.path==='/api/registro/nova-calidad-fotos'&&c.body.request_receipt),uploads=__mock.calls.filter(c=>c.path==='/api/documentos');return {sameSelectedB:document.getElementById('fotoFrente').files[0]===__mock.photoB,otherFileObjectsPreserved:['fotoReverso','fotoSelfie'].every((id,i)=>document.getElementById(id)===__mock.inputs[i+1]&&document.getElementById(id).files[0]===__mock.files[i+1]),noStaleAUpload:uploads.length===1&&uploads[0].body.foto_base64===reviews[1].body.photos.frente&&uploads[0].body.foto_base64!==reviews[0].body.photos.frente,qualityRequests:reviews.length,uploads:uploads.length,registrationPosts:__mock.calls.filter(c=>c.path==='/api/registro').length};});
  assert.equal(proof.sameSelectedB,true);assert.equal(proof.otherFileObjectsPreserved,true);assert.equal(proof.noStaleAUpload,true);assert.equal(proof.qualityRequests,2);assert.equal(proof.registrationPosts,0);
  results.push({case:'PHOTO02 real Chrome: frozen Save and late A response after B selection',passed:true,...proof,screenshots:[frozen,await capture(page,'photo-B-preserved-after-stale-response')],calls:await calls(page)});await page.close();
 }
 // The managed SMS branch is locally enabled only; production flag is not changed.
 {
  const page=await setup({sms:true});await verify(page,{sms:true});assert.equal(await page.evaluate(()=>otpManagedAttempt.state),'verified');
  await page.locator('#cedula').fill('87654321');await page.waitForFunction(()=>!document.getElementById('btnEnviarOtp').disabled&&!document.getElementById('btnEnviarOtpSms').hidden);
  const proof=await page.evaluate(()=>({files:__filesPreserved(),otpVerified:otpVerificado,registrationSession:registroSession,terminalAttemptCleared:otpManagedAttempt===null,sendCount:__mock.calls.filter(c=>c.path==='/api/otp/enviar').length,whatsappAvailable:!document.getElementById('btnEnviarOtp').disabled,smsAvailable:!document.getElementById('btnEnviarOtpSms').disabled}));
  assert.equal(proof.files,true);assert.equal(proof.otpVerified,false);assert.equal(proof.registrationSession,null);assert.equal(proof.terminalAttemptCleared,true);assert.equal(proof.sendCount,1);assert.equal(proof.whatsappAvailable,true);assert.equal(proof.smsAvailable,true);
  results.push({case:'OTP-L01 real Chrome: locally managed terminal identity edit',passed:true,...proof,screenshots:[await capture(page,'managed-identity-edit-preserves-files')],calls:await calls(page)});await page.close();
 }
 {
  const page=await setup();await page.evaluate(()=>{__mock.pending=true;__mock.sendState='accepted';});await page.locator('#btnEnviarOtp').click();
  await page.waitForFunction(()=>document.getElementById('codeRow').classList.contains('show'));const acceptedText=await page.locator('#otpStatus').innerText();assert.match(acceptedText,/Si lo recibiste/);assert.doesNotMatch(acceptedText,/Código enviado|entregado|leído/);
  await page.evaluate(()=>{__mock.shift+=16000;__mock.sendState='uncertain';});await page.locator('#btnEnviarOtp').click();await page.waitForFunction(()=>!document.getElementById('codeRow').classList.contains('show'));
  const proof=await page.evaluate(()=>({files:__filesPreserved(),uncertainText:document.getElementById('otpStatus').textContent,codeHidden:!document.getElementById('codeRow').classList.contains('show'),sendCount:__mock.calls.filter(c=>c.path==='/api/otp/enviar').length}));
  assert.equal(proof.files,true);assert.equal(proof.codeHidden,true);assert.equal(proof.sendCount,2);assert.match(proof.uncertainText,/no está confirmado/);assert.doesNotMatch(proof.uncertainText,/Código enviado|entregado|leído/);
  results.push({case:'OTP03 real Chrome: legacy 202 accepted versus uncertain',passed:true,acceptedText,...proof,screenshots:[await capture(page,'legacy-202-uncertain-truthful')],calls:await calls(page)});await page.close();
 }
 assert.equal(unexpected.length,0);assert.equal(pageErrors.length,0);
 const receipt={checkedAt:new Date().toISOString(),browser:context.browser()?.version(),playwright:'preinstalled package',isolation:'Headless Chrome, temporary /private/tmp profile, no existing profile attached, wildcard DNS disabled, all page routes intercepted, CSP connect-src none, closed fetch mocks',candidateFormSha256:sha(candidate),baselineSha256:sha(baseline),runnerSha256:sha(await import('node:fs').then(fs=>fs.readFileSync(fileURLToPath(import.meta.url)))),tests:results.length,passed:results.filter(r=>r.passed).length,failed:0,results,pageErrors,unexpectedNetworkRequests:unexpected,networkRequests:network,actualApiNetworkRequests:network.filter(n=>n.origin!==origin).length,productionWrites:false,realOtpSends:false,realOcr:false,actualCustomerFiles:false};
 await writeFile(new URL('receipt.json',evidence),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({passed:receipt.passed,failed:0,browser:receipt.browser,candidateFormSha256:receipt.candidateFormSha256,receipt:fileURLToPath(new URL('receipt.json',evidence))},null,2));
}catch(error){
 await writeFile(new URL('failure.json',evidence),JSON.stringify({checkedAt:new Date().toISOString(),message:error.message,stack:error.stack,completedCases:results,pageErrors,unexpected},null,2)+'\n');throw error;
}finally{await context.close();await rm(profile,{recursive:true,force:true});}

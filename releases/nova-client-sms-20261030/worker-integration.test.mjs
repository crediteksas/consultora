import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
const base=fs.readFileSync(new URL('./production-base.mjs',import.meta.url),'utf8');
const candidate=fs.readFileSync(new URL('./candidate-entry.mjs',import.meta.url),'utf8');
const bundle=fs.readFileSync(new URL('./index.mjs',import.meta.url),'utf8');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
function originalFunction(source,name,next){const start=source.indexOf('async function '+name+'(');const end=source.indexOf('\n'+next,start);assert.ok(start>=0&&end>start,name);return source.slice(start,end);}
async function load(source,identifier,fetcher=()=>{throw Error('No network allowed in test');}){
  const context=vm.createContext({console,process,Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,AbortSignal,crypto:globalThis.crypto,atob,btoa,setTimeout,clearTimeout,performance,Buffer,fetch:fetcher});
  const m=new vm.SourceTextModule(source,{context,identifier});
  await m.link(async spec=>{
    if(spec==='cloudflare:workers')return new vm.SyntheticModule(['WorkerEntrypoint'],function(){this.setExport('WorkerEntrypoint',class {});},{context});
    if(spec==='node:events'){const {EventEmitter}=await import('node:events');return new vm.SyntheticModule(['EventEmitter'],function(){this.setExport('EventEmitter',EventEmitter);},{context});}
    throw Error('Unexpected module '+spec);
  });await m.evaluate();return m.namespace;
}

test('build is pinned to inspected production, emits exactly same exports',async()=>{
  assert.equal(hash(base),'744e1ee8db4cafde7a5774cc01799e00263b9af669f3af20a2fa615ff0e3ae18');
  const [a,b]=await Promise.all([load(base,'base'),load(bundle,'sms')]);assert.deepEqual(Object.keys(a),Object.keys(b));
});
test('original verifier, resume/session/quality and old reservation implementations unchanged in transform',()=>{
  for(const [name,next] of [['verifySecureOtp2','__name(verifySecureOtp2'],['reserveOtp2','__name(reserveOtp2'],['sendSecureOtp2','__name(sendSecureOtp2'],['enviarPlantillaOtp2','__name(enviarPlantillaOtp2'],['handleOtpVerificarRoute2','__name(handleOtpVerificarRoute2']])assert.equal(originalFunction(candidate,name,next),originalFunction(base,name,next),name);
  // Named legacy anchors only restrict plaintext readers, not secure verification.
  const receipt=JSON.parse(fs.readFileSync(new URL('./build-receipt.json',import.meta.url)));
  assert.deepEqual(receipt.anchors.map(a=>a.name),['new-routes','outer-router','secure-send-gate','legacy-old-copy-verify','legacy-old-copy-register','legacy-active-verify','legacy-active-register','embedded-form']);
});
test('compiled Worker routes new APIs; options off is read-only and default hidden',async()=>{
  const ns=await load(bundle,'sms-options');assert.equal(ns.useRegistration('/api/otp/opciones'),true);assert.equal(ns.useRegistration('/api/otp/estado'),true);
  const r=await ns.default.fetch(new Request('https://registro.crediteksas.com/api/otp/opciones',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enlace_token:'t'.repeat(48)})}),{},{});
  assert.equal(r.status,200);assert.deepEqual(await r.json(),{smsEnabled:false});assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal((await ns.default.fetch(new Request('https://registro.crediteksas.com/api/otp/opciones'),{},{})).status,405);
});
test('compiled candidate serves same revised embedded form without modifying file controls',async()=>{
  const ns=await load(bundle,'sms-form');const r=await ns.default.fetch(new Request('https://registro.crediteksas.com/nova/registro'),{},{});assert.equal(r.status,200);const html=await r.text();assert.ok(html.includes('btnEnviarOtpSms'));assert.ok(html.includes('No tengo WhatsApp'));
  const form=fs.readFileSync(new URL('./form.html',import.meta.url),'utf8');const baseline=fs.readFileSync(new URL('./form-base.html',import.meta.url),'utf8');
  for(const type of ['file']){const files=s=>[...s.matchAll(/<input\b[^>]*type=["']file["'][^>]*>/g)].map(m=>m[0]);assert.deepEqual(files(form),files(baseline));}
});
test('flag off preserves original WhatsApp validation/body; SMS cannot silently use old WA',async()=>{
  const [a,b]=await Promise.all([load(base,'base-wa'),load(bundle,'sms-wa')]);const body={enlace_token:'t'.repeat(48),cedula:'10000001',celular:'3000000000',turnstile_token:'synthetic'};
  const request=extra=>new Request('https://registro.crediteksas.com/api/otp/enviar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,...extra})});
  const r1=await a.default.fetch(request(),{},{}),r2=await b.default.fetch(request(),{},{});assert.equal(r1.status,r2.status);assert.deepEqual(await r1.json(),await r2.json());
  const sms=await b.default.fetch(request({channel:'sms',request_id:'11111111-1111-4111-8111-111111111111',sms_reason:'no_whatsapp'}),{},{});assert.equal(sms.status,503);assert.equal((await sms.json()).state,'not_sent');
});
test('managed requests reject unbounded JSON before provider/reservation',async()=>{
  const ns=await load(bundle,'sms-bound');const r=await ns.default.fetch(new Request('https://registro.crediteksas.com/api/otp/enviar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({extra:'a'.repeat(5000)})}),{NOVA_SMS_ENABLED:'true'},{});assert.equal(r.status,400);
});
test('legacy verify isolates secure SMS rows; legacy plaintext challenge can still verify',async()=>{
  for(const row of [null,{id:'synthetic-legacy',codigo:'123456',intentos:0}]){
    const calls=[];const ns=await load(bundle,'legacy-verify-'+!!row,async(url,init={})=>{calls.push([String(url),init]);
      if(!init.method){const u=new URL(url);assert.equal(u.searchParams.get('codigo_hash'),'is.null');assert.equal(u.searchParams.get('enlace_registro_id'),'is.null');return new Response(JSON.stringify(row?[row]:[]));}
      assert.equal(init.method,'PATCH');return new Response(null,{status:204});
    });const r=await ns.default.fetch(new Request('https://registro.crediteksas.com/api/otp/verificar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({celular:'3000000000',codigo:'123456'})}),{NOVA_SMS_ENABLED:'true',ALLOW_LEGACY_REGISTRATION_LINKS:'true'},{});
    assert.equal(r.status,row?200:400);assert.equal(calls.length,row?2:1);
  }
});
test('legacy registration cannot reuse a verified secure/SMS OTP; it only queries plaintext unbound rows',async()=>{
  const ns=await load(bundle,'legacy-register',async(url)=>{const u=new URL(url);assert.equal(u.pathname,'/rest/v1/otp_codigos');assert.equal(u.searchParams.get('verificado'),'eq.true');assert.equal(u.searchParams.get('codigo_hash'),'is.null');assert.equal(u.searchParams.get('enlace_registro_id'),'is.null');return new Response('[]');});
  const body={cedula:'10000001',nombre_completo:'Prueba Sintetica',celular:'3000000000',ciudad:'Prueba',origen_codigo:'CK-01',vendedor_nombre:'Prueba',autorizacion_datos:true,otp_ok:true};
  const r=await ns.default.fetch(new Request('https://registro.crediteksas.com/api/registro',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),{NOVA_SMS_ENABLED:'true',ALLOW_LEGACY_REGISTRATION_LINKS:'true'},{});assert.equal(r.status,400);
});
test('legacy WA send remains available with SMS on and legacy flag true; never chooses SMS without bound input',async()=>{
  const calls=[];const ns=await load(bundle,'legacy-send',async(url,init={})=>{calls.push(String(url));if(String(url).includes('graph.facebook.com'))return new Response('{}');if(init.method==='POST')return new Response(null,{status:201});return new Response('[]',{headers:{'content-range':'0-0/0'}});});
  const r=await ns.default.fetch(new Request('https://registro.crediteksas.com/api/otp/enviar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({celular:'3000000000'})}),{NOVA_SMS_ENABLED:'true',ALLOW_LEGACY_REGISTRATION_LINKS:'true',PHONE_NUMBER_ID:'123456'},{});assert.equal(r.status,200);assert.ok(calls.some(u=>u.includes('graph.facebook.com')));assert.ok(!calls.some(u=>u.includes('inalambria')));
});

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.dirname(fileURLToPath(import.meta.url));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const base=fs.readFileSync(path.join(root,'production-base.mjs'),'utf8');
if(sha(base)!=='744e1ee8db4cafde7a5774cc01799e00263b9af669f3af20a2fa615ff0e3ae18')throw Error('Production baseline changed');
const form=fs.readFileSync(path.join(root,'form.html'),'utf8');
let candidate=base;
const anchors=[];
function replace(name,before,after){if(candidate.split(before).length!==2)throw Error('Nonunique anchor '+name);anchors.push({name,beforeSHA256:sha(before),afterSHA256:sha(after)});candidate=candidate.replace(before,after);}
replace('new-routes', '    if (url.pathname === "/api/registro/nova-retomar") return respond(await resumeRetailRegistration(request, env22222));',
`    if (["/api/otp/opciones", "/api/otp/estado"].includes(url.pathname)) {
      if (request.method !== "POST") return respond(json22({ok:false},405));
      try {
        const input = await readManagedOtpBody(request);
        const outcome = await (url.pathname === "/api/otp/opciones" ? managedOtpOptions : managedOtpStatus)(input,env22222,smsOtpDependencies());
        const response = json22(outcome.body,outcome.status);
        response.headers.set("cache-control","no-store");
        return respond(response);
      } catch { return respond(json22({ok:false,error:"Solicitud inválida"},400)); }
    }
    if (url.pathname === "/api/registro/nova-retomar") return respond(await resumeRetailRegistration(request, env22222));`);
replace('outer-router','["/api/otp/enviar", "/api/otp/verificar", "/api/documentos",', '["/api/otp/enviar", "/api/otp/verificar", "/api/otp/opciones", "/api/otp/estado", "/api/documentos",');
replace('secure-send-gate',`async function handleOtpEnviarRoute2(request, env22222) {
  const body22 = await requestJson2(request);`,
`async function handleOtpEnviarRoute2(request, env22222) {
  let body22;
  if (env22222.NOVA_SMS_ENABLED === "true") {
    try { body22 = await readManagedOtpBody(request.clone()); }
    catch { return json22({ok:false,error:"Solicitud inválida"},400); }
  } else { body22 = await requestJson2(request); }
  if ((env22222.NOVA_SMS_ENABLED === "true" && isSecureOtpSendRequest2(body22)) || body22?.channel !== undefined || body22?.request_id !== undefined || body22?.sms_reason !== undefined) {
    const outcome = await sendManagedOtp(body22,request.headers.get("CF-Connecting-IP"),env22222,smsOtpDependencies());
    const response = json22(outcome.body,outcome.status);
    response.headers.set("cache-control","no-store");
    return response;
  }`);
// Keep existing plaintext legacy WA available. It cannot verify or reuse an OTP
// created by the bound secure flow (including SMS) for a different registration.
for (const [suffix,label] of [['6','old-copy'],['62','active']]) {
  for (const [verified,tail,kind] of [['false','&expira_at=gte.${ahora}','verify'],['true','','register']]) {
    const before='${SUPABASE_URL'+suffix+'}/rest/v1/otp_codigos?celular=eq.${encodeURIComponent(celular)}&verificado=eq.'+verified+tail+'&order=created_at.desc&limit=1';
    const after=before.replace('&order=', '&codigo_hash=is.null&enlace_registro_id=is.null&order=');
    replace('legacy-'+label+'-'+kind,before,after);
  }
}
const match=candidate.match(/^var pilot_form_default = (".*");$/m);
if(!match)throw Error('Missing embedded form');
replace('embedded-form',match[0],'var pilot_form_default = '+JSON.stringify(form)+';');
candidate=`import {managedOtpOptions,managedOtpStatus,sendManagedOtp,readManagedOtpBody} from './managed-otp.mjs';
function smsOtpDependencies() {
  return {fetcher:fetch,supabaseUrl:SUPABASE_URL22,headers:supabaseHeaders2,resolveContext:resolveContext2,verifyTurnstile:verifyTurnstile2,generateCode:generateOtp2,hash:hashOpaqueToken2};
}
`+candidate;
fs.writeFileSync(path.join(root,'candidate-entry.mjs'),candidate);
const require=createRequire(import.meta.url);
let esbuild;
try{esbuild=require('esbuild');}catch{esbuild=require('/Users/oscarm/Creditek/baseline/consultora/node_modules/esbuild');}
await esbuild.build({entryPoints:[path.join(root,'candidate-entry.mjs')],outfile:path.join(root,'index.mjs'),bundle:true,format:'esm',platform:'neutral',target:'es2022',external:['cloudflare:workers','node:*'],logLevel:'silent'});
const bundle=fs.readFileSync(path.join(root,'index.mjs'));
fs.mkdirSync(path.join(root,'deploy'),{recursive:true});
fs.writeFileSync(path.join(root,'deploy/index.mjs'),bundle);
fs.writeFileSync(path.join(root,'deploy/form.html'),form);
fs.writeFileSync(path.join(root,'build-receipt.json'),JSON.stringify({baselineSHA256:sha(base),formSHA256:sha(form),candidateSHA256:sha(bundle),candidateBytes:bundle.byteLength,anchors},null,2)+'\n');
console.log(JSON.stringify({build:'pass',anchors:anchors.length,bytes:bundle.byteLength,sha256:sha(bundle)}));

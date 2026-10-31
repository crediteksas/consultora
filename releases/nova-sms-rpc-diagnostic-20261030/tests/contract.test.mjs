import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {transformDiagnostic,BASELINE_SHA256,FORM_SHA256,sha} from '../transform.mjs';
const root=new URL('../',import.meta.url),baseline=await readFile(new URL('baseline/index.mjs',root),'utf8'),candidate=await readFile(new URL('deploy/index.mjs',root),'utf8'),form=await readFile(new URL('deploy/form.html',root),'utf8');
function mask(source){for(const [start,end]of [['async function rpc(','\nvar contextBody ='],['async function novaActiveOtp2(','\nfunction novaActiveOtpReply2('],['function smsOtpDependencies()','\nvar __defProp']]){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);source=source.slice(0,a)+start+'REVIEWED_HELPER'+source.slice(b);}return source;}
test('only three named functions differ; entire remaining bundle/form remains byte-identical',()=>{assert.equal(sha(baseline),BASELINE_SHA256);assert.equal(sha(form),FORM_SHA256);assert.equal(mask(candidate),mask(baseline));assert.equal(transformDiagnostic(baseline),candidate);assert.equal((baseline.match(/redirect\s*:\s*["']error["']/g)||[]).length,2);assert.equal((candidate.match(/redirect\s*:\s*["']error["']/g)||[]).length,0);});
test('pinned transform refuses baseline drift and already-transformed code',()=>{assert.throws(()=>transformDiagnostic(baseline+'\n'),/BASELINE_DRIFT/);assert.throws(()=>transformDiagnostic(candidate),/BASELINE_DRIFT/);});
const env={NOVA_SMS_ENABLED:'true',INALAMBRIA_SMS_API_KEY:'sk_test_synthetic_not_real'},input={enlace_token:'synthetic-registration-token-at-least32',celular:'3000000000'};
const cases=[
 ['allowed',()=>Response.json({smsEnabled:true}),true,null],['not allowed',()=>Response.json({smsEnabled:false}),false,null],
 ['404 PGRST202',()=>Response.json({code:'PGRST202',message:'private-sentinel-3000000000'},{status:404}),false,false],
 ['401',()=>Response.json({message:'private-sentinel-3000000000'},{status:401}),false,false],
 ['403 42501',()=>Response.json({code:'42501',message:'private-sentinel-3000000000'},{status:403}),false,false],
 ['network',()=>{throw Error('private-sentinel-3000000000');},false,true],
 ['malformed JSON',()=>new Response('private-sentinel-3000000000',{headers:{'content-type':'application/json'}}),false,true],
 ['redirect',()=>new Response('private-sentinel-3000000000',{status:302,headers:{location:'https://never-follow.invalid/'}}),false,true]
];
for(const [name,response,allowed,uncertain]of cases)test('real managed options/rpc contract: '+name,async()=>{
 const scope={AbortSignal,TextEncoder,TextDecoder,Uint8Array,Date,WeakMap};vm.createContext(scope);vm.runInContext(candidate.slice(0,candidate.indexOf('// releases/nova-client-sms-20261030/candidate-entry.mjs')),scope);
 let calls=0;const deps={supabaseUrl:'https://only-mock.invalid',headers:()=>({}),resolveContext:async()=>({ok:true,enlaceId:'10000000-0000-4000-8000-000000000001'}),fetcher:async(url,options)=>{calls++;assert.equal(url,'https://only-mock.invalid/rest/v1/rpc/nova_client_otp_options');assert.equal(options.redirect,'manual');return response();}};
 const out=await scope.managedOtpOptions(input,env,deps);assert.equal(out.status,200);assert.equal(out.body.smsEnabled,allowed);assert.equal(calls,1);assert.equal(JSON.stringify(out).includes('private-sentinel'),false);assert.equal(JSON.stringify(out).includes(input.celular),false);assert.equal(JSON.stringify(out).includes(input.enlace_token),false);assert.equal(JSON.stringify(out).includes(env.INALAMBRIA_SMS_API_KEY),false);
 if(uncertain!==null){const outcome=await scope.rpc('nova_client_otp_options',{},env,deps);assert.equal(outcome.ok,false);assert.equal(outcome.uncertain,uncertain);assert.equal(JSON.stringify(outcome).includes('private-sentinel'),false);}
});

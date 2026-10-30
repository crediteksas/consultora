import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Miniflare,Response as MFResponse,convertV4MiniflareOptions} from '/Users/oscarm/.npm/_npx/2fea031b5bd76b2e/node_modules/miniflare/dist/src/index.js';
import {sha} from '../transform.mjs';
const root=new URL('../',import.meta.url),baseline=await readFile(new URL('baseline/index.mjs',root),'utf8'),candidate=await readFile(new URL('deploy/index.mjs',root),'utf8');
const native='fetcher: fetch, supabaseUrl: SUPABASE_URL22',wrapped='fetcher: (...args) => fetch(...args), supabaseUrl: SUPABASE_URL22';
function functionText(s,name){let a=s.indexOf('async function '+name+'(');if(a<0)a=s.indexOf('function '+name+'(');const b=s.indexOf('\n__name('+name+',',a);assert.ok(a>=0&&b>a,name);return s.slice(a,b);}
function script(s){
 const prefix=s.slice(0,s.indexOf('// releases/nova-client-sms-20261030/candidate-entry.mjs'));
 const a=s.indexOf('async function novaActiveOtp2('),b=s.indexOf('\nfunction novaActiveOtpReply2(',a),c=s.indexOf('function smsOtpDependencies()'),d=s.indexOf('\nvar __defProp',c);
 return prefix+'\n'+functionText(s,'supabaseHeaders2')+'\n'+functionText(s,'otpUrl2')+'\n'+s.slice(a,b)+'\n'+s.slice(c,d)+String.raw`
 var SUPABASE_URL22='https://rpc-fixture.invalid';
 async function resolveContext2(){return {ok:true,enlaceId:'10000000-0000-4000-8000-000000000001'};}
 function verifyTurnstile2(){}function generateOtp2(){}function hashOpaqueToken2(){}
 export default {async fetch(request){
  const mode=new URL(request.url).pathname.slice(1),env={NOVA_SMS_ENABLED:'true',INALAMBRIA_SMS_API_KEY:'sk_test_synthetic_not_real',SUPABASE_SERVICE_KEY:'fixture-not-a-key'};
  let constructorError=null;try{new Request('https://rpc-fixture.invalid/',{redirect:'error'});}catch(error){constructorError=error.name;}
  const deps=smsOtpDependencies(),nativeFetcher=deps.fetcher,transportErrors=[];
  deps.fetcher=async function(...args){try{return await Reflect.apply(nativeFetcher,this,args);}catch(error){transportErrors.push({name:error.name,reason:/Illegal invocation/.test(error.message)?'ILLEGAL_INVOCATION':/redirect/i.test(error.message)?'UNSUPPORTED_REDIRECT':'OTHER'});throw error;}};
  const value=mode==='active'?await novaActiveOtp2({cedula:'000000000000',celular:'3000000000'},'10000000-0000-4000-8000-000000000001',env,deps.fetcher,Date.now()):
    await managedOtpOptions({enlace_token:'synthetic-registration-token-at-least32',celular:'3000000000'},env,deps);
  return Response.json({constructorError,value,transportErrors});
 }};
 `;
}
const checks=[],sources=[['baseline',baseline],['direct_manual',candidate.replace(wrapped,native)],['wrapped_error',baseline.replace(native,wrapped)],['candidate',candidate]];
for(const [label,source]of sources)for(const mode of ['options','active'])for(const redirect of [false,true]){
 let requests=0,followed=0;
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:script(source),compatibilityDate:'2026-01-15',cf:false,outboundService:async request=>{
  if(new URL(request.url).hostname!=='rpc-fixture.invalid'){followed++;return new MFResponse('blocked',{status:500});}
  requests++;if(redirect)return new MFResponse('redirect',{status:302,headers:{location:'https://must-not-follow.invalid/'}});
  return new MFResponse(JSON.stringify(mode==='active'?[]:{smsEnabled:true}),{headers:{'content-type':'application/json'}});
 }}));
 try{
  const response=await mf.dispatchFetch('http://localhost/'+mode),out=await response.json();assert.equal(out.constructorError,'TypeError');assert.equal(followed,0);
  const expectedFailure=label==='baseline'&&mode==='options'||label==='direct_manual'&&mode==='options'?'ILLEGAL_INVOCATION':label==='baseline'||label==='wrapped_error'?'UNSUPPORTED_REDIRECT':null;
  assert.equal(requests,expectedFailure?0:1,JSON.stringify({label,mode,redirect,out,followed}));
  assert.equal(mode==='active'?out.value.ok:out.value.body.smsEnabled,!expectedFailure&&!redirect);
  assert.deepEqual(out.transportErrors,expectedFailure?[{name:'TypeError',reason:expectedFailure}]:[]);
  checks.push({label,mode,redirect,passed:true,requests,redirectsFollowed:followed,transportFailure:expectedFailure});
 }finally{await mf.dispose();}
}
const receipt={engine:'Real workerd through Miniflare4 in installed Wrangler4.156.0',baselineSha256:sha(baseline),candidateSha256:sha(candidate),tests:checks.length,passed:checks.length,failed:0,checks,realProviderCalls:0,productionWrites:0};
await writeFile(new URL('./workerd-receipt.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));

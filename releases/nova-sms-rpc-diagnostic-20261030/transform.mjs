import {createHash} from 'node:crypto';
export const BASELINE_SHA256='6010453e3c6aa8d07fb9e4f213c67119cd0a8c9360a864a861b727810ff5fee4';
export const FORM_SHA256='ef6c89485e34b4b80f7df3e68f962c0ac66232d4a0e7ec8e3a06073554810b07';
export const sha=s=>createHash('sha256').update(s).digest('hex');
const once=(s,b,a,label)=>{if(s.split(b).length!==2)throw Error('SMS_RPC_ANCHOR_DRIFT:'+label);return s.replace(b,a);};
export function transformDiagnostic(source){
 if(typeof source!=='string'||sha(source)!==BASELINE_SHA256)throw Error('SMS_RPC_BASELINE_DRIFT');
 const start=source.indexOf('async function rpc('),end=source.indexOf('\nvar contextBody =',start);
 if(start<0||end<=start)throw Error('SMS_RPC_FUNCTION_DRIFT');
 let rpc=source.slice(start,end);
 rpc=once(rpc,'signal: AbortSignal.timeout(8e3), redirect: "error"','signal: AbortSignal.timeout(8e3), redirect: "manual"','supported-redirect-mode');
 rpc=once(rpc,'  let value;\n  try {','  if (response2.status >= 300 && response2.status < 400) {\n    void response2.body?.cancel().catch(() => {});\n    return { ok: false, uncertain: true };\n  }\n  let value;\n  try {','refuse-redirect');
 let next=source.slice(0,start)+rpc+source.slice(end);
 const a=next.indexOf('async function novaActiveOtp2('),b=next.indexOf('\nfunction novaActiveOtpReply2(',a);
 if(a<0||b<=a)throw Error('SMS_ACTIVE_OTP_FUNCTION_DRIFT');
 let active=next.slice(a,b);
 active=once(active,"redirect:'error'","redirect:'manual'",'active-otp-redirect-mode');
 active=once(active,"    if(!response.ok||!response.body||Number(response.headers.get('content-length'))>4096){","    if(response.status>=300&&response.status<400){void response.body?.cancel().catch(()=>{});return {ok:false};}\n    if(!response.ok||!response.body||Number(response.headers.get('content-length'))>4096){",'active-otp-refuse-redirect');
 next=next.slice(0,a)+active+next.slice(b);
 return once(next,'return { fetcher: fetch, supabaseUrl: SUPABASE_URL22, headers: supabaseHeaders2, resolveContext: resolveContext2, verifyTurnstile: verifyTurnstile2, generateCode: generateOtp2, hash: hashOpaqueToken2 };','return { fetcher: (...args) => fetch(...args), supabaseUrl: SUPABASE_URL22, headers: supabaseHeaders2, resolveContext: resolveContext2, verifyTurnstile: verifyTurnstile2, generateCode: generateOtp2, hash: hashOpaqueToken2 };','native-fetch-receiver');
}


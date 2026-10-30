import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { transformNova } from './transform.mjs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '/Users/oscarm/Creditek/baseline/consultora/node_modules/@electric-sql/pglite/dist/index.js');
export const originalSource=await readFile(new URL('../baseline/nova/index.mjs',import.meta.url),'utf8');
export const source=process.env.NOVA_REPAIR_CANDIDATE?await readFile(process.env.NOVA_REPAIR_CANDIDATE,'utf8'):transformNova(originalSource);
export const baselineSql=await readFile(new URL('./baseline-rpcs.sql',import.meta.url),'utf8');
export const patchSql=await readFile(process.env.NOVA_REFERENCE_MIGRATION||new URL('../aura/supabase/migrations/20261030213851_nova_reference_order_and_uncertainty.sql',import.meta.url),'utf8');
export const ids={ref:'10000000-0000-4000-8000-000000000001',app:'20000000-0000-4000-8000-000000000002',source:'30000000-0000-4000-8000-000000000003'};
export const secret='synthetic-reference-repair-pepper-at-least32';
export const from='573000000001';
export const contact=createHash('sha256').update(secret+':'+from.slice(2)).digest('hex');
export const payload='1'.repeat(64);
export async function database({patched=true}={}) {
 const db=new PGlite();
 await db.exec(`
 create table public.nova_credit_applications(id uuid primary key,store_code text,data_consent_granted boolean);
 create table public.nova_reference_verifications(id uuid primary key,application_id uuid references public.nova_credit_applications(id),reference_type text,contact_hash text,superseded_at timestamptz);
 create table public.nova_registration_receipts(application_id uuid primary key references public.nova_credit_applications(id),source_application_id uuid,payload_hash text,received_at timestamptz default now());
 create table public.nova_reference_dialogues(
  reference_id uuid primary key references public.nova_reference_verifications(id),application_id uuid not null,contact_hash text not null,payload_hash text not null,
  revision integer not null default 0 check(revision between 0 and 30),state jsonb not null default '{}',status text not null default 'active' check(status in ('active','completed','declined','stopped')),
  outcome text,expires_at timestamptz not null,send_state text not null default 'none' constraint nova_reference_dialogues_send_state_check check(send_state in ('none','reserved','accepted','failed')),
  attempt_id uuid,event_id text,event_hash text,updated_at timestamptz not null default now());
 create unique index nova_reference_one_active_contact on public.nova_reference_dialogues(contact_hash) where status='active';
 create table public.nova_reference_events(reference_id uuid references public.nova_reference_dialogues(reference_id),event_id text,event_hash text,revision integer,primary key(reference_id,event_id));
 create table public.nova_retail_reference_dispatch(reference_id uuid primary key,source_id uuid,contact_hash text,state text,provider_message_id text,error_code integer,delivered_at timestamptz,
  attempts int default 1,next_attempt_at timestamptz default now(),attempt_id uuid default gen_random_uuid(),created_at timestamptz default now(),updated_at timestamptz default now());
 create table public.nova_retail_reference_dispatch_events(id bigint generated always as identity primary key,reference_id uuid,status text,provider_message_id text,error_code int,at timestamptz default now());
 `);
 await db.exec(baselineSql);
 // Match the captured production ACL: invoker functions, service_role only.
 await db.exec('create role anon;create role authenticated;create role service_role;');
 const functions=(await db.query("select oid::regprocedure::text signature from pg_proc where pronamespace='public'::regnamespace and proname like 'nova_%'")).rows;
 for(const {signature} of functions) await db.exec('revoke all on function '+signature+' from public,anon,authenticated;grant execute on function '+signature+' to service_role;');
 if(patched) await db.exec(patchSql);
 await db.query("insert into public.nova_credit_applications values($1,'CK-01',true)",[ids.app]);
 await db.query("insert into public.nova_reference_verifications values($1,$2,'personal',$3,null)",[ids.ref,ids.app,contact]);
 await db.query("insert into public.nova_registration_receipts(application_id,source_application_id,payload_hash) values($1,$2,$3)",[ids.app,ids.source,payload]);
 return db;
}
export const sqlValue=async(db,name,args)=>(await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') as value',args)).rows[0].value;
export const dialogue=async db=>(await db.query('select * from public.nova_reference_dialogues where reference_id=$1',[ids.ref])).rows[0];
export async function receiver(db,{transport=async()=>new Response(JSON.stringify({messages:[{id:'fixture-outbound'}]}),{status:200}),verifySource=async()=>true,otpResult={accepted:true}}={}) {
 const actual=name=>{let s=source.indexOf('async function '+name+'(');if(s<0)s=source.indexOf('function '+name+'(');const e=source.indexOf('\n__name('+name+',',s);if(s<0||e<s)throw Error(name);return source.slice(s,e)};
 const declaration=prefix=>{const s=source.indexOf(prefix);if(s<0)throw Error(prefix);return source.slice(s,source.indexOf('\n',s))};
 const hash=async s=>createHash('sha256').update(s).digest('hex'),key=s=>webcrypto.subtle.importKey('raw',new TextEncoder().encode(s),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
 let transportCalls=0,otpCalls=0;
 const sandbox={crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,structuredClone,AbortSignal,__name:f=>f,hash2:hash,key22:key,key,UUID32:uuid,UUID2:uuid,UUID22:uuid,HASH4:/^[a-f0-9]{64}$/,HASH22:/^[a-f0-9]{64}$/,HASH2:/^[a-f0-9]{64}$/,
 NOVA_PHONE_ID2:'fixture-phone',hex22:b=>Buffer.from(b).toString('hex'),hex:b=>Buffer.from(b).toString('hex'),boundedJson22:r=>r.json(),referencePhoneVerified2:()=>false,
 runReferenceOtp2:async()=>{otpCalls++;return otpResult;}};
 const choicesEnd=source.indexOf('function referenceChoiceId('),choicesStart=source.lastIndexOf('\nvar UUID',choicesEnd)+1;
 const code=[...['var normalize = ','var CONSENT = ','var RELATIONS = ','var DURATIONS = ','var referenceEnabled2 = ','var referenceOtpReady2 = '].map(declaration),source.slice(choicesStart,choicesEnd),
 ...['advanceReference2','referenceChoiceId','parseReferenceChoice2','referenceReplyPayload2','verifyReferenceInvitation','referenceInvitation','processReferenceMessage'].map(actual)].join('\n');
 vm.createContext(sandbox);vm.runInContext(code,sandbox);
 const order={nova_reference_for_event:['p_contact_hash','p_event_id'],nova_reference_context:['p_reference_id','p_contact_hash'],
 nova_reference_send_ack:['p_reference_id','p_attempt_id','p_accepted'],nova_reference_transition:['p_reference_id','p_contact_hash','p_payload_hash','p_expires_at','p_revision','p_event_id','p_event_hash','p_state','p_outcome']};
 const rpc=async(name,args)=>{if(!order[name])throw Error(name);return sqlValue(db,name,order[name].map(k=>args[k]));};
 const env={NOVA_REFERENCES_ENABLED:'true',NOVA_REFERENCE_INVITATIONS_APPROVED:'true',NOVA_PII_HASH_PEPPER:secret,NOVA_META_ACCESS_TOKEN:'synthetic-not-a-token',NOVA_REFERENCE_OTP_ENABLED:'true',
 NOVA_REFERENCE_OTP_STORAGE_READY:'true',NOVA_REFERENCE_OTP_SECRET:'synthetic-otp-secret-at-least32bytes'};
 const invitation=await sandbox.referenceInvitation({reference_id:ids.ref,payload_hash:payload},secret,Date.now());
 const run=(text,id,extra={})=>sandbox.processReferenceMessage({id,from,phoneId:'fixture-phone',at:Date.now()-1,verifiedWebhook:true,text,...extra},env,
 {rpc,verifySource,now:()=>Date.now(),fetcher:async(...args)=>{transportCalls++;return transport(...args);}});
 return {run,start:(id='fixture-start')=>run('REFERENCIA '+invitation.token,id),get counts(){return {transportCalls,otpCalls}},invitation};
}


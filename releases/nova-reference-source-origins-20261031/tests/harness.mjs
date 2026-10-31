import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {sourceProof} from '../transform.mjs';
const root=new URL('../',import.meta.url);
export const ids={source:'11111111-1111-4111-8111-111111111111',client:'22222222-2222-4222-8222-222222222222',app:'33333333-3333-4333-8333-333333333333',other:'44444444-4444-4444-8444-444444444444'};
export const phoneHash=phone=>createHash('sha256').update('synthetic-pepper:'+phone).digest('hex');
export function fixture(origin='CK-09'){
 return {sourceId:ids.source,sourceRows:[{cliente_id:ids.client,phone:'3000000001',origin,consent:{granted:true,revoked:false,channels:['whatsapp']},revoked_at:null}],clients:[{celular:'3000000001',autorizacion_datos:true}],outbox:[{state:'delivered',application_id:ids.app}],origins:[{codigo:origin,activo:true}],refs:[{type:'family',telefono:'3000000002',nombre:'Referencia Ficticia Uno',parentesco:'Familiar',contact_authorized:true},{type:'personal',telefono:'3000000003',nombre:'Referencia Ficticia Dos',contact_authorized:true}],receipts:[{source_application_id:ids.source,source_client_id:ids.client,application_id:ids.app,accepted_channels:['whatsapp']}],env:{NOVA_REGISTRATION_INTAKE_TOKEN:'synthetic-token',SUPABASE_SERVICE_KEY:'sb_secret_synthetic',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_synthetic',NOVA_PII_HASH_PEPPER:'synthetic-pepper',NOVA_REGISTRATION_PILOT_ORIGINS:'CK-01,CK-02,CK-03,CK-04,CK-05,CK-06,CK-07,CK-08,CK-09',NOVA_RETAIL_ENABLED:'true'}};
}
export async function harness(f=fixture(),{baseline=false,otherSources=[]}={}){
 const fixtures=[f,...otherSources],bySource=id=>fixtures.find(x=>x.sourceId===id);
 const calls=[];let rpcBody=null;
 const raw=await readFile(new URL(baseline?'../../nova-sms-sync-pilot-20261031/deploy/clientes/index.mjs':'../deploy/clientes/index.mjs',import.meta.url),'utf8');
 const nova=await readFile(new URL('../nova-otp-delivery-20261031/deploy/nova/index.mjs',root),'utf8');
 const chunkStart=nova.indexOf('var referenceDelivery = (() => {'),chunkEnd=nova.indexOf('\ncurrentReferenceSource =',chunkStart);
 assert.ok(chunkStart>=0&&chunkEnd>chunkStart);
 const headers=new Headers({'content-type':'application/json'});
 const json=(body,status=200)=>Response.json(body,{status,headers});
 async function closedFetch(input,init={}){
  const u=new URL(input),method=init.method||'GET';calls.push({host:u.hostname,path:u.pathname,query:u.search,method});
  if(u.hostname==='ditiwpndvmyuqcagupea.supabase.co'){
   assert.equal(method,'GET');assert.equal(u.pathname,'/rest/v1/nova_registration_receipts');return json(bySource(u.searchParams.get('source_application_id')?.slice(3))?.receipts||[]);
  }
  assert.equal(u.hostname,'jfkmiyvcdfbsbwchyvol.supabase.co','External/provider network is forbidden');
  const name=u.pathname.replace('/rest/v1/','');
  if(name==='rpc/kora_nova_effective_references'){
   assert.equal(method,'POST');rpcBody=JSON.parse(init.body);const source=bySource(rpcBody.p_source);assert.ok(source);assert.deepEqual(Object.keys(rpcBody),['p_source']);
   if(source.rpcThrows)throw Error('SYNTHETIC_UNAVAILABLE');return json(source.refs,source.rpcStatus||200);
  }
  assert.equal(method,'GET','No database writes are allowed');
  if(name==='kora_nova_sources')return json(bySource(u.searchParams.get('solicitud_id')?.slice(3))?.sourceRows||[]);
  if(name==='clientes')return json(fixtures.find(x=>x.sourceRows[0]?.cliente_id===u.searchParams.get('id')?.slice(3))?.clients||[]);
  if(name==='kora_nova_outbox')return json(bySource(u.searchParams.get('solicitud_id')?.slice(3))?.outbox||[]);
  if(name==='origenes')return json(fixtures.find(x=>x.sourceRows[0]?.origin===u.searchParams.get('codigo')?.slice(3))?.origins||[]);
  throw Error('Unexpected DB route');
 }
 const context=vm.createContext({Request,Response,Headers,URL,TextEncoder,Uint8Array,AbortSignal,crypto:webcrypto,fetch:closedFetch,console:{warn(){},log(){}},__name:x=>x,__name2:x=>x,__name22:x=>x,uuid2:/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,tokenValido2:async(a,b)=>a===b,boundedJson2:async(r,max)=>{const t=await r.text();if(new TextEncoder().encode(t).length>max)throw Error('SIZE');return JSON.parse(t);},boundedJson2222222:async r=>r.json(),prepareReferenceInvitations:async()=>{throw Error('NO_DISPATCH');},secretEqual2:async()=>true,validSignature2222:async()=>false,referenceInvitation:async()=>{throw Error('NO_INVITATION');}});
 vm.runInContext(sourceProof(raw).text+'\nglobalThis.proof=referenceSourceProof;',context);
 vm.runInContext(nova.slice(chunkStart,chunkEnd)+'\nglobalThis.delivery=referenceDelivery;',context);
 const env={...f.env,KORA_REGISTRATION_SOURCE:{fetch:async(url,init)=>context.proof(new Request(url,init),env)}};
 const proof=async({sourceId=f.sourceId,token=env.NOVA_REGISTRATION_INTAKE_TOKEN,method='POST'}={})=>context.proof(new Request('https://kora.internal/internal/nova-reference-source',{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...method==='POST'?{body:JSON.stringify({sourceId})}:{}}),env);
 const verify=async(ref={source_application_id:f.sourceId,application_id:ids.app,reference_type:'family',contact_hash:phoneHash('3000000002')})=>context.delivery.verifyReferenceSource(ref,env);
 return {proof,verify,calls,env,get rpcBody(){return rpcBody;}};
}

import test from 'node:test';import assert from 'node:assert/strict';
import {reviewPhotos,verifyQuality,digest,subject} from './photo-quality.mjs';
const now=Date.now(),session={purpose:'registro',otpId:'11111111-1111-4111-8111-111111111111',enlaceId:'22222222-2222-4222-8222-222222222222',cedula:'12345678',celular:'3000000000',exp:now+3600000};
const env={ALLOWED_ORIGIN:'https://registro.crediteksas.com',REGISTRATION_SIGNING_SECRET:'test-key-not-production',NOVA_REGISTRATION_PILOT_ORIGINS:'CK-01,CK-02,CK-03,CK-04,CK-05,CK-06,CK-07,CK-08,CK-09',NOVA_QUALITY_LIMIT:{limit:async()=>({success:true})},NOVA_DOCUMENT_AI:{}};
const photo=n=>Buffer.from([255,216,255,...Array(100).fill(n)]).toString('base64');
const body=()=>({registro_session:'session',enlace_token:'link',name:'Persona Prueba',consent:true,consent_version:'nova-photo-quality-v3',photos:{frente:photo(1),reverso:photo(2),selfie:photo(3)}});
const request=b=>new Request(env.ALLOWED_ORIGIN+'/api/registro/nova-calidad-fotos',{method:'POST',headers:{origin:env.ALLOWED_ORIGIN,'content-type':'application/json'},body:JSON.stringify(b)});
const deps={verifySession:async()=>session,resolveContext:async()=>({enlaceId:session.enlaceId,origen:{codigo:'CK-02'}}),boundedJson:r=>r.json(),recordConsent:async()=>{},now:()=>now};
const good={frente:{kind:'frente',confident:true,issues:[],document_number:'12345678',full_name:'Persona Prueba'},reverso:{kind:'reverso',confident:true,issues:[]},selfie:{kind:'selfie',confident:true,issues:[],face_visible:true,document_visible:true}};
test('correct photo goes to model alone, receipt binds every uploaded hash',async()=>{
 const b=body(),hashes=Object.fromEntries(await Promise.all(Object.entries(b.photos).map(async([k,v])=>[k,await digest(Buffer.from(v,'base64'))])));
 const state={subject_hash:await subject(session,b.name),hashes:{...hashes,frente:'old'},results:{frente:{issues:['blur'],status:'needs_correction'},reverso:{issues:[],status:'auto_approved'},selfie:{issues:[],status:'auto_approved'}},failures:{frente:1,reverso:0,selfie:0}};
 let calls=0;const storage=async(action,args)=>{
  if(action==='claim')return {state,cached:false,lease:'test'};
  assert.deepEqual(args.p_results,{frente:[],reverso:[],selfie:[]});return {...state,hashes,results:Object.fromEntries(Object.keys(good).map(t=>[t,{issues:[],status:'auto_approved'}]))};
 };
 const r=await reviewPhotos(request(b),env,{...deps,storage,run:async(_,input)=>{calls++;const images=input.messages[1].content.filter(x=>x.type==='image_url');assert.equal(images.length,1);assert.equal(images[0].image_url.url,'data:image/jpeg;base64,'+b.photos.frente);return {response:JSON.stringify(good)};}});
 assert.equal(r.status,200);const data=await r.json();assert.equal(calls,1);assert.equal(data.manualReview,false);assert.deepEqual(await verifyQuality(data.receipt,session,b.name,env.REGISTRATION_SIGNING_SECRET,now),hashes);
 assert.equal(await verifyQuality(data.receipt,session,'Otro Nombre',env.REGISTRATION_SIGNING_SECRET,now),null);
});
test('fourth failed attempt yields manual receipt; no false approval',async()=>{
 const b=body();const hashes=Object.fromEntries(await Promise.all(Object.entries(b.photos).map(async([k,v])=>[k,await digest(Buffer.from(v,'base64'))])));
 const state={hashes,subject_hash:await subject(session,b.name),failures:{frente:4,reverso:0,selfie:0},results:{frente:{status:'manual_pending',issues:['blur']},reverso:{status:'auto_approved',issues:[]},selfie:{status:'auto_approved',issues:[]}}};
 const r=await reviewPhotos(request(b),env,{...deps,storage:async()=>({cached:true,state}),run:()=>assert.fail('cached manual result must not trigger AI')});
 const d=await r.json();assert.equal(r.status,200);assert.equal(d.manualReview,true);assert.equal(d.photoStates.frente.status,'manual_pending');assert.equal(d.photoStates.frente.remaining,0);assert.ok(d.receipt);
});
test('AI failure persists manual result but storage failure blocks submission',async()=>{
 let finished=false;
 const storage=async(action,args)=>{if(action==='claim')return {state:{failures:{},hashes:{},results:{}},lease:'test'};finished=true;assert.deepEqual(args.p_results.frente,['service_error']);return {failures:{},results:Object.fromEntries(Object.keys(good).map(t=>[t,{status:'manual_pending',issues:['service_error']}]))};};
 const r=await reviewPhotos(request(body()),env,{...deps,storage,run:async()=>{throw Error('provider unavailable');}});assert.equal(r.status,200);assert.equal((await r.json()).manualReview,true);assert.equal(finished,true);
 const bad=await reviewPhotos(request(body()),env,{...deps,storage:async()=>{throw Error('DB unavailable');}});assert.equal(bad.status,503);assert.equal((await bad.json()).receipt,undefined);
});
test('auth failure, malformed images and rate limit cannot generate manual fallback',async()=>{
 let n=0;const storage=async()=>{n++;throw Error();};
 const b=body();b.photos.frente='bad';assert.equal((await reviewPhotos(request(b),env,{...deps,storage})).status,400);
 assert.equal((await reviewPhotos(request(body()),env,{...deps,storage,verifySession:async()=>{throw Error();}})).status,403);
 assert.equal((await reviewPhotos(request(body()),{...env,NOVA_QUALITY_LIMIT:{limit:async()=>({success:false})}},{...deps,storage})).status,429);assert.equal(n,0);
});
test('recovery reuses approved hashes and issues a document session for only the missing upload',async()=>{
 const b=body(),hashes=Object.fromEntries(await Promise.all(Object.entries(b.photos).map(async([k,v])=>[k,await digest(Buffer.from(v,'base64'))])));
 b.photos={selfie:b.photos.selfie};b.partial=true;b.request_receipt=true;
 const resumed={...session,resumeSourceId:'33333333-3333-4333-8333-333333333333',resumeClientId:'44444444-4444-4444-8444-444444444444',resumeName:b.name};
 const state={subject_hash:await subject(resumed,b.name),hashes,failures:{},results:Object.fromEntries(Object.keys(good).map(t=>[t,{issues:[],status:'auto_approved'}]))};
 const r=await reviewPhotos(request(b),env,{...deps,verifySession:async()=>resumed,storage:async()=>({state,cached:true}),run:()=>assert.fail('approved photo reprocessed'),issueDocuments:async(s,h)=>{assert.equal(s.resumeSourceId,resumed.resumeSourceId);assert.deepEqual(h,hashes);return 'sealed-document-session';}});
 const d=await r.json();assert.equal(r.status,200);assert.equal(d.documentos_session,'sealed-document-session');assert.deepEqual(await verifyQuality(d.receipt,resumed,b.name,env.REGISTRATION_SIGNING_SECRET,now),hashes);
 b.name='Different Person';assert.equal((await reviewPhotos(request(b),env,{...deps,verifySession:async()=>resumed,storage:()=>assert.fail('name change accepted')})).status,403);
});
test('a duplicated replacement photo does not invalidate the previously approved photo',async()=>{
 const b=body(),oldHashes=Object.fromEntries(await Promise.all(Object.entries(b.photos).map(async([k,v])=>[k,await digest(Buffer.from(v,'base64'))])));b.photos.reverso=b.photos.frente;b.partial=true;
 const state={subject_hash:await subject(session,b.name),hashes:oldHashes,failures:{},results:Object.fromEntries(Object.keys(good).map(t=>[t,{issues:[],status:'auto_approved'}]))};
 const storage=async(action,args)=>{if(action==='claim')return {state,lease:'test'};assert.deepEqual(args.p_results.frente,[]);assert.deepEqual(args.p_results.reverso,['duplicate']);return {...state,results:{...state.results,reverso:{issues:['duplicate'],status:'needs_correction'}}};};
 const r=await reviewPhotos(request(b),env,{...deps,storage,run:()=>assert.fail('duplicate should not call AI')});const d=await r.json();assert.equal(r.status,422);assert.equal(d.errors.frente,undefined);assert.ok(d.errors.reverso);assert.equal(d.photoStates.frente.status,'auto_approved');
});

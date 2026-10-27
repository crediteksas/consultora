import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {referenceProgress,REFERENCE_WAIT_MS} from './policy.mjs';
import {summarizeReference,withReferenceDiagnostics,createRetailRuntime,sha} from './retail-runtime.mjs';
const html=await fs.readFile(new URL('retail-portal.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function referenceObservation('),html.indexOf('async function authToken('));
const format=vm.runInNewContext(source+';referenceObservation');
const now=Date.parse('2026-10-27T18:46:00Z');
const ref={id:'fixture',type:'family',name:'Referencia de prueba',phone:'private-phone',contact_hash:'private-hash',deliveredAt:'2026-10-27T18:35:46Z',deliveryStatus:'read',responded:false};
test('timeout, refusal, contact decline and exhausted delivery retain distinct diagnoses',()=>{
 const cases=[[{},'response_timeout'],[{deliveryFailed:true},'delivery_failed'],[{contactDeclined:true},'contact_declined'],[{refusedToAnswer:true},'refused_to_answer']];
 for(const [extra,reason]of cases){const summary=summarizeReference({...ref,...extra},now);assert.equal(summary.status,'replace');assert.equal(summary.reason,reason);assert(!JSON.stringify(summary).includes('private-'));const text=format(summary);assert(text.includes('Gestión:'));assert(!text.includes('motivo aún no está disponible'));}
});
test('delivered and read messages without answers explain timeout and what Andrea can manage',()=>{
 const text=format(summarizeReference(ref,now));assert(text.includes('No respondió el formulario'));assert(text.includes('10 minutos'));assert(text.includes('WhatsApp leído'));assert(text.includes('reemplazar esta referencia'));assert(!text.includes('se negó'));
});
test('diagnostics decorate the response without changing stored evidence, revision or manual decision',()=>{
 const stored={revision:5,state:'authorized',manual_note:'Fixture review',summary:{references:[{id:ref.id,status:'replace',name:ref.name}]}};
 const before=JSON.stringify(stored),display=withReferenceDiagnostics(stored,[ref],now);
 assert.equal(JSON.stringify(stored),before);assert.equal(display.revision,5);assert.equal(display.state,'authorized');assert.equal(display.manual_note,stored.manual_note);
 assert.equal(display.summary.references[0].reason,'response_timeout');assert.equal(display.summary.references[0].deliveryStatus,'read');assert(!JSON.stringify(display).includes('private-'));
});
test('clock starts at confirmed delivery and accepts a completed response after timeout',()=>{
 assert.equal(referenceProgress({...ref,deliveredAt:null},now).reason,'awaiting_delivery');
 assert.equal(referenceProgress({...ref,deliveredAt:new Date(now-REFERENCE_WAIT_MS+1).toISOString()},now).reason,'awaiting_response');
 const summary=summarizeReference({...ref,responded:true,knowsCustomer:true,relationshipConfirmed:true,contactConfirmed:true},now);assert.equal(summary.status,'approved');assert.equal(summary.reason,null);
});
test('contradictory answers and unknown legacy replacement reasons are not reported as timeouts',()=>{
 for(const [extra,reason]of [[{knowsCustomer:false},'does_not_know_customer'],[{contradictory:true},'contradictory_information'],[{responded:true,contactConfirmed:false},'contact_unconfirmed']]){const s=summarizeReference({...ref,...extra},now);assert.equal(s.status,'review');assert.equal(s.reason,reason);assert(!format(s).includes('No respondió el formulario'));}
 assert(format({status:'replace',type:'family'}).includes('motivo aún no está disponible'));
});
for(const global of [true,false])test('detail API keeps diagnostics internal; global='+global,async()=>{
 const sourceId='11111111-1111-4111-8111-111111111111',appId='22222222-2222-4222-8222-222222222222',actorId='33333333-3333-4333-8333-333333333333';
 const expected=[{type:'family',nombre:'Familiar de prueba',telefono:'3000000001'},{type:'personal',nombre:'Personal de prueba',telefono:'3000000002'}];
 const references=await Promise.all(expected.map(async(r,i)=>({id:'ref-'+i,reference_type:r.type,contact_hash:await sha('fixture:'+r.telefono)})));
 const source={solicitud_id:sourceId,otp_id:appId,input_hash:'fixture-input',registration:{p_origen_codigo:'CK-03',p_nombre_completo:'Cliente de prueba',p_celular:'3000000000'}};
 const row={source_id:sourceId,store_code:'CK-03',revision:5,state:'review',summary:{references:[]}};let saved;
 const fetcher=async(url,init)=>{
  if(url.includes('/auth/v1/user'))return Response.json({id:actorId});
  if(url.includes('/perfiles?'))return Response.json([{id:actorId,nombre:'Revisor de prueba',rol:global?'admin':'admin_tienda',tienda_codigo:global?null:'CK-03'}]);
  if(url.includes('/nova_retail_reviewers?'))return Response.json(global?[{can_review:true}]:[]);
  if(url.includes('/kora_nova_sources?'))return Response.json([source]);
  if(url.includes('/rpc/kora_nova_effective_references'))return Response.json(expected);
  if(url.includes('/nova_retail_cases?')&&init.method==='PATCH')return new Response(null,{status:204});
  if(url.includes('/nova_retail_cases?'))return Response.json([row]);
  if(url.includes('/nova_retail_photo_reviews?'))return Response.json([]);
  if(url.includes('/documentos_solicitud?'))return Response.json([]);
  if(url.includes('/nova_registration_receipts?'))return Response.json([{application_id:appId}]);
  if(url.includes('/nova_platform_jobs?'))return Response.json([]);
  if(url.includes('/nova_reference_verifications?'))return Response.json(references);
  if(url.includes('/nova_reference_dialogues?'))return Response.json([]);
  if(url.includes('/nova_retail_reference_dispatch?'))return Response.json(references.map(r=>({reference_id:r.id,state:'read',attempts:1,delivered_at:ref.deliveredAt})));
  if(url.includes('/rpc/nova_retail_save')){saved=JSON.parse(init.body);return Response.json({...row,summary:saved.p_summary,decision:saved.p_decision});}
  if(url.includes('/nova_retail_case_events?')||url.includes('/nova_retail_photo_events?'))return Response.json([]);
  assert.fail('Unexpected call '+url);
 };
 const runtime=createRetailRuntime({fetcher,now:()=>now});
 const response=await runtime.api(new Request('https://nova.test/api/retail',{method:'POST',headers:{origin:'https://aura.crediteksas.com',authorization:'Bearer fixture-session-at-least-twenty','content-type':'application/json'},body:JSON.stringify({action:'detail',id:sourceId})}),{NOVA_RETAIL_ENABLED:'true',KORA_SUPABASE_SERVICE_ROLE_KEY:'fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture',NOVA_PII_HASH_PEPPER:'fixture'});
 assert.equal(response.status,200);const body=await response.json();
 if(!global){assert(!JSON.stringify(body).includes('response_timeout'));assert(!JSON.stringify(body).includes('deliveryStatus'));assert(!('summary'in body));assert(!('case'in body));return;}
 assert(body.case.summary.references.every(r=>r.reason==='response_timeout'&&r.deliveryStatus==='read'));
 assert(saved.p_summary.references.every(r=>!('reason'in r)&&!('deliveryStatus'in r)));
 assert(body.corrections.every(r=>r.action==='replace_reference'));
});

test('both expired references ask Andrea to replace both, without inventing an answer',()=>{
 const refs=[summarizeReference(ref,now),summarizeReference({...ref,id:'second',type:'personal'},now)];
 for(const r of refs){const text=format(r,refs);assert(text.includes('reemplazar ambas referencias'));assert(!text.includes('ya respondió'));}
 const approved={id:'approved',status:'approved'};
 assert(format(refs[0],[refs[0],approved]).includes('conservando la referencia aprobada'));
});
test('contact mismatch without an answer describes contact data, not a contradictory answer',()=>{
 const r=summarizeReference({...ref,contradictory:true,contactMismatch:true},now);
 assert.equal(r.status,'review');assert.equal(r.reason,'contact_mismatch');assert(!format(r).includes('La respuesta contradice'));assert(format(r).includes('comprobar los datos'));
});
test('diagnostic clock cannot attach timeout to an earlier waiting state',()=>{
 const row={summary:{references:[{id:ref.id,status:'waiting'}]}};
 assert.equal(withReferenceDiagnostics(row,[ref],now).summary.references[0].reason,null);
});
test('read without confirmed delivery does not claim a response clock has started',()=>{
 const text=format(summarizeReference({...ref,deliveredAt:null},now));assert(text.includes('plazo de respuesta no ha comenzado'));assert(!text.includes('WhatsApp leído;'));
});

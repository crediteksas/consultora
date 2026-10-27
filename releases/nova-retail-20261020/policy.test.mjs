import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluatePlatforms,evaluateApplication,referenceProgress,storeResult,VALIDITY_MS,REFERENCE_WAIT_MS,RETAIL_STORES} from './policy.mjs';
const now=Date.parse('2026-10-20T22:00:00Z');
const obligation=(paid,overdue=0)=>({id:'contract-1',active:true,paidInstallments:paid,overdueInstallments:overdue});
const platform=(name,obligations=[])=>({platform:name,status:'observed',identityVerified:true,checkedAt:now,obligationsComplete:true,obligations});
const pair=(paid,overdue=0)=>[platform('PAYJOY',[obligation(paid,overdue)]),platform('ALO')];
const approvedRef=(type,phone)=>({type,phone,responded:true,knowsCustomer:true,relationshipConfirmed:true,contactConfirmed:true});
const complete=()=>({storeCode:'CK-02',customerPhone:'3000000000',platforms:pair(1),photos:Object.fromEntries(['frente','reverso','selfie'].map(t=>[t,{status:'auto_approved'}])),references:[approvedRef('family','3000000001'),approvedRef('personal','3000000002')]});
test('all nine retail stores only',()=>{for(const s of RETAIL_STORES)assert.equal(evaluateApplication({...complete(),storeCode:s},now).state,'authorized');assert.equal(evaluateApplication({...complete(),storeCode:'AL-1'},now).state,'out_of_scope');});
test('zero payments reject even before first due date and override other history',()=>{
  for(const overdue of [0,1,2,3])assert.equal(evaluatePlatforms(pair(0,overdue),now).state,'rejected');
  const d=evaluatePlatforms([platform('PAYJOY',[obligation(6)]),platform('ALO',[obligation(0)])],now);assert.equal(d.state,'rejected');assert.equal(d.overrideAllowed,false);
});
test('financial decision combinations',()=>{for(let paid=1;paid<=6;paid++)for(let overdue=0;overdue<=4;overdue++)assert.equal(evaluatePlatforms(pair(paid,overdue),now).state,overdue>2||(overdue>0&&paid<4)?'review':'authorized',`${paid} paid ${overdue} overdue`);});
test('confirmed zero payments reject even in an incomplete third response',()=>{
 const partial={...platform('KREDIYA',[{...obligation(0),overdueInstallments:null}]),obligationsComplete:false};
 assert.equal(evaluatePlatforms([...pair(4),partial],now).state,'rejected');
 assert.equal(evaluatePlatforms([...pair(4),{...platform('KREDIYA'),obligationsComplete:false}],now).state,'authorized');
});
test('two platforms enough, failed third ignored, absence must be explicitly verified',()=>{
 assert.equal(evaluatePlatforms([platform('PAYJOY'),platform('ALO')],now).state,'authorized');
 assert.equal(evaluatePlatforms([...pair(4),{platform:'KREDIYA',status:'failed'}],now).state,'authorized');
 assert.equal(evaluatePlatforms([platform('PAYJOY')],now).state,'review');
 assert.equal(evaluatePlatforms([{platform:'PAYJOY',status:'observed'},platform('ALO')],now).state,'review');
});
test('unknown counts, stale, mismatched, duplicate and future evidence never approve',()=>{
 for(const change of [{identityVerified:false},{checkedAt:now+1},{checkedAt:now-86400000},{obligations:[{...obligation(4),paidInstallments:null}]},{obligationsComplete:false}]){
   assert.equal(evaluatePlatforms([{...platform('PAYJOY',[obligation(4)]),...change},platform('ALO')],now).state,'review');
 }
 assert.equal(evaluatePlatforms([platform('PAYJOY'),platform('PAYJOY')],now).state,'review');
});
test('most restrictive of all debts wins',()=>{assert.equal(evaluatePlatforms([platform('PAYJOY',[obligation(5),obligation(2,1)]),platform('ALO')],now).state,'review');assert.equal(evaluatePlatforms([platform('PAYJOY',[obligation(5),obligation(0)]),platform('ALO')],now).state,'rejected');});
test('reference timer starts at delivery, exact timeout, refusal and contradiction',()=>{
 assert.equal(referenceProgress({sentAt:now-REFERENCE_WAIT_MS*2},now).state,'awaiting_delivery');
 assert.equal(referenceProgress({deliveredAt:now-REFERENCE_WAIT_MS+1},now).state,'waiting');
 assert.equal(referenceProgress({deliveredAt:now-REFERENCE_WAIT_MS},now).state,'replace');
 assert.deepEqual(referenceProgress({contactDeclined:true},now),{state:'replace',reason:'contact_declined',mayContactAgain:false});
 assert.equal(referenceProgress({knowsCustomer:false},now).state,'review');
});
test('photo and reference observations block automatic processing',()=>{
 const a=complete();assert.equal(evaluateApplication(a,now).canProcess,true);
 a.photos.selfie.status='manual_pending';assert.equal(evaluateApplication(a,now).state,'review');
 a.photos.selfie.status='needs_correction';assert.equal(evaluateApplication(a,now).state,'correct');
 delete a.photos;assert.equal(evaluateApplication(a,now).state,'correct');
});
test('reference identity, category, refusal and contradictions',()=>{
 for(const mutate of [a=>a.references[1].phone=a.references[0].phone,a=>a.references[0].phone=a.customerPhone,a=>a.references[1].type='family']){const a=complete();mutate(a);assert.equal(evaluateApplication(a,now).state,'correct');}
 const a=complete();a.references[0].contradictory=true;assert.equal(evaluateApplication(a,now).state,'review');
 a.references[0].contradictory=false;a.references[0].contactDeclined=true;assert.equal(evaluateApplication(a,now).state,'correct');assert.equal(a.references[1].responded,true);
});
test('rejection persists across stores for 15 days, renewal reevaluates evidence',()=>{
 for(const storeCode of RETAIL_STORES)assert.equal(evaluateApplication({...complete(),storeCode,lastRejectedAt:now-VALIDITY_MS+1},now).state,'rejected');
 assert.equal(evaluateApplication({...complete(),lastRejectedAt:now-VALIDITY_MS},now).state,'authorized');
});
test('delivery requires new queries, public status conceals internal reasons',()=>{
 assert.equal(evaluateApplication({...complete(),deliveryRequested:true},now).state,'review');
 assert.equal(evaluateApplication({...complete(),deliveryRequested:true,queriesMadeForDelivery:true},now).state,'authorized');
 assert.deepEqual(storeResult({state:'rejected',reasons:['zero_payments']}),{status:'Rechazado'});
});

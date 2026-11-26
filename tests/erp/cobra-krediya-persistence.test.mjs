import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {webcrypto,createHash} from 'node:crypto';
const require=createRequire(import.meta.url),P=require('../../releases/cobra-krediya-20261125/quality-persistence.js');
const id='11111111-1111-4111-8111-111111111111',id2='22222222-2222-4222-8222-222222222222';
const row=(overrides={})=>({contract:'fiction001',document:'111001',customer:'Ana Ejemplo',store:'Tienda Ficticia A',month:'2026-10',created:'2026-10-01',cutoff:'2026-11-25',financedCents:40000000,feeCents:5000000,totalInstallments:12,frequency:15,cycled:3,paid:1,overdue:2,...overrides});
const args=(rows=[row()])=>({bytes:new Uint8Array([1,2,3]),name:'fiction.xlsx',rows,month:'2026-10',requestId:id,crypto:webcrypto});
const ack=r=>({id:id2,request_id:r.p_request_id,row_count:r.p_rows.length,file_sha256:r.p_file_sha256,cutoff:r.p_cutoff,cohort_month:r.p_cohort_month,duplicate:false,status:'observations_saved',official_quality:false});
test('payload links every imported store in the month and has no payment action',async()=>{
 const r=await P.prepareCut(args([row(),row({contract:'fiction002',store:'Tienda Ficticia B'}),row({contract:'fiction003',month:'2026-09',created:'2026-09-01'})]));
 assert.equal(r.p_rows.length,2);assert.equal(r.p_file_sha256,createHash('sha256').update(Buffer.from([1,2,3])).digest('hex'));assert.equal('payment_id' in r,false);assert.equal(Object.isFrozen(r.p_rows),true);
});
test('snapshot captures source bytes, data and cutoff before async hashing',async()=>{
 let release;const a=args();a.crypto={subtle:{digest:async(algorithm,bytes)=>{await new Promise(r=>release=r);return webcrypto.subtle.digest(algorithm,bytes);}}};const promise=P.prepareCut(a);a.bytes[0]=9;a.rows[0].cutoff='2026-11-26';a.rows[0].paid=9;release();const result=await promise;assert.equal(result.p_cutoff,'2026-11-25');assert.equal(result.p_rows[0].paid,1);assert.equal(result.p_file_sha256,createHash('sha256').update(Buffer.from([1,2,3])).digest('hex'));
});
test('empty, duplicate and mixed cutoff input cannot prepare a cut',async()=>{
 for(const rows of [[],[row(),row()],[row(),row({contract:'fiction002',cutoff:'2026-11-24'})]])await assert.rejects(()=>P.prepareCut(args(rows)));
});
test('concurrent clicks share one immutable RPC',async()=>{
 const r=await P.prepareCut(args());let calls=0,release;const s=P.createStore({rpc:async(name,body)=>{assert.equal(name,'cobra_krediya_save_cut');calls++;await new Promise(r=>release=r);return {data:ack(body),error:null};}});
 const a=s.save(r),b=s.save(r);assert.equal(a,b);release();await a;assert.equal(calls,1);
});
test('same request ID with different content is rejected while pending',async()=>{
 const r=await P.prepareCut(args());let release;const s=P.createStore({rpc:async(_,b)=>{await new Promise(r=>release=r);return{data:ack(b)}}});const first=s.save(r);await assert.rejects(s.save({...r,p_cutoff:'2026-11-26'}));release();await first;
});
test('lost reply can be retried with the same identity and reports a duplicate receipt',async()=>{
 const r=await P.prepareCut(args());let calls=0;const s=P.createStore({rpc:async(_,b)=>++calls===1?{error:{message:'fictional response loss'}}:{data:{...ack(b),duplicate:true}}});await assert.rejects(s.save(r));assert.equal((await s.save(r)).duplicate,true);assert.equal(calls,2);
});
test('wrong or missing receipt never announces successful persistence',async()=>{
 const r=await P.prepareCut(args());for(const change of [{row_count:0},{cutoff:'2026-10-01'},{file_sha256:'wrong'},{official_quality:true},{status:'approved'},{request_id:null}]){const s=P.createStore({rpc:async()=>({data:{...ack(r),...change}})});await assert.rejects(s.save(r));}
});
test('a caller mutating an arbitrary request cannot alter the in-flight payload or receipt check',async()=>{
 const original=await P.prepareCut(args()),mutable=JSON.parse(JSON.stringify(original));let release;const s=P.createStore({rpc:async(_,b)=>{await new Promise(r=>release=r);return{data:ack(b)}}});const p=s.save(mutable);mutable.p_cutoff='2030-01-01';mutable.p_rows=[];release();assert.equal((await p).row_count,1);
});
const operation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',obligation='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const management=()=>P.prepareCollection({requestId:id,operationId:operation,type:'note',channel:'call',note:' Llamada ficticia '});
const eventAck=r=>({id:id2,request_id:r.p_request_id,operation_id:r.p_operation_id,obligation_id:null,event_type:r.p_event_type,created_at:'2026-11-26T01:00:00Z',duplicate:false,status:'collection_saved',payment_created:false});
test('collection request uses operation identity and does not claim or request a payment',()=>{const r=management();assert.equal(r.p_operation_id,operation);assert.equal(r.p_note,'Llamada ficticia');assert.equal('p_obligation_id' in r,false);assert.equal('payment' in r,false);});
test('invalid collection and incomplete commitments fail before RPC',()=>{
 const a={requestId:id,operationId:operation,type:'note',channel:'call',note:'Example'};
 for(const change of [{operationId:'unknown'},{type:'payment'},{channel:'webhook'},{note:' '},{promiseAmount:100},{type:'promise',promiseDate:'2026-11-27',promiseAmount:100},{type:'promise',promiseDate:'2026-11-25',promiseAmount:100,today:'2026-11-26'},{type:'promise',promiseDate:'2026-11-27',promiseAmount:1.5,today:'2026-11-26'}])assert.throws(()=>P.prepareCollection({...a,...change}));
 const r=P.prepareCollection({...a,type:'promise',promiseDate:'2026-11-27',promiseAmount:100,today:'2026-11-26'});assert.equal(r.p_promise_amount,100);
});
test('collection double click is one RPC and rejects mutation while pending',async()=>{
 const r=management();let release,calls=0;const s=P.createCollectionStore({rpc:async(name,b)=>{assert.equal(name,'cobra_krediya_save_collection');calls++;await new Promise(r=>release=r);return{data:eventAck(b)};}});const first=s.save(r);assert.equal(first,s.save(r));await assert.rejects(s.save({...r,p_note:'Other'}));release();await first;assert.equal(calls,1);
});
test('collection lost acknowledgement retries the same identity',async()=>{
 const r=management();let calls=0;const s=P.createCollectionStore({rpc:async(_,b)=>++calls===1?{error:{message:'fiction'}}:{data:{...eventAck(b),duplicate:true}}});await assert.rejects(s.save(r));assert.equal((await s.save(r)).duplicate,true);assert.equal(calls,2);
});
test('collection reply mismatches never count as saved',async()=>{
 const r=management();for(const diff of [{operation_id:id},{request_id:id2},{payment_created:true},{event_type:'payment'},{created_at:''},{obligation_id:undefined},{duplicate:null}])await assert.rejects(P.createCollectionStore({rpc:async()=>({data:{...eventAck(r),...diff}})}).save(r));
});
test('collection captures mutable callers before awaiting',async()=>{
 const r={...management()};let release;const s=P.createCollectionStore({rpc:async(_,b)=>{await new Promise(r=>release=r);return{data:eventAck(b)}}});const p=s.save(r);r.p_operation_id=id;release();assert.equal((await p).operation_id,operation);
});
test('operation event joins an existing portfolio row only for display and retains source',()=>{
 const e={id:id2,operation_id:operation,obligation_id:null,note:'fiction'},p=[{id:obligation,operation_id:operation}];const r=P.mapEventsToPortfolio([e],p);assert.equal(r.events[0].obligation_id,obligation);assert.equal(r.events[0].source_obligation_id,null);assert.equal(e.obligation_id,null);assert.equal(r.unlinked.length,0);assert.equal(p.length,1);
});
test('existing obligation events are preserved and credits without obligations remain outside old financial portfolio',()=>{
 const old={id:id2,obligation_id:obligation,note:'legacy'},noDebt={id,operation_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',obligation_id:null};const r=P.mapEventsToPortfolio([old,noDebt],[{id:obligation,operation_id:operation}]);assert.equal(r.events[0].id,id2);assert.equal(r.unlinked[0].id,id);assert.equal(r.events.length,1);
});
test('ambiguous or contradictory event references cannot attach to another credit',()=>{
 const p=[{id:obligation,operation_id:operation}],e={id:id2,operation_id:operation,obligation_id:null};for(const [events,portfolio] of [[[e],[...p,...p]],[[e,e],p],[[{...e,obligation_id:id}],p],[[{...e,operation_id:id,obligation_id:obligation}],p]])assert.throws(()=>P.mapEventsToPortfolio(events,portfolio));
});

test('legacy portfolio without operation remains usable and UUID versions do not disable history',()=>{
 const legacy='019a0000-0000-7000-8000-000000000001',e={id:id2,operation_id:null,obligation_id:legacy};const result=P.mapEventsToPortfolio([e],[{id:legacy,operation_id:null}]);assert.equal(result.events[0].obligation_id,legacy);assert.equal(result.unlinked.length,0);
});

test('missing portfolio operation column is an explicit integration error',()=>{
 assert.throws(()=>P.mapEventsToPortfolio([{id:id2,operation_id:operation,obligation_id:obligation}],[{id:obligation}]),/no incluye operation_id/);
});

test('an event with both references cannot attach to an obligation with a null operation',()=>{assert.throws(()=>P.mapEventsToPortfolio([{id:id2,operation_id:operation,obligation_id:obligation}],[{id:obligation,operation_id:null}]),/dos créditos/);});

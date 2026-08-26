import test from 'node:test';
import assert from 'node:assert/strict';
import { PayJoyAdapterReal,AloAdapterReal,AddiAdapterReal,KrediyaAdapterReal,KoraReadOnlySource,syncAnonymizedSnapshot,classifyReconciliation,isReminderEligible } from '../../lib/cartera/kora-readonly-adapters.mjs';

const evidenced={external_id:'CONTRACT-1',origen_codigo:'STORE-01',monto_credito:500000,created_at:'2026-08-25T12:00:00Z'};

test('PayJoy y ALO conservan ID real con namespace y reportan campos faltantes',()=>{
  for(const adapter of [new PayJoyAdapterReal(),new AloAdapterReal()]){
    const result=adapter.normalize(evidenced);assert.match(result.record.external_obligation_id,/^(payjoy|alo):CONTRACT-1$/);assert.equal(result.status,'INCOMPLETE');
    for(const gap of ['customer_external_id','outstanding_balance','installment_amount','due_date','last_payment_at'])assert.ok(result.gaps.includes(gap));
  }
});

test('Addi conserva loan_id y monto confirmado pero sigue INCOMPLETE; Krediya no inventa estructura',()=>{
  const addi=new AddiAdapterReal().normalize({loan_id:'LOAN-1',approved_amount:700000});assert.equal(addi.record.external_obligation_id,'addi:LOAN-1');assert.equal(addi.record.original_amount,700000);assert.equal(addi.status,'INCOMPLETE');
  const krediya=new KrediyaAdapterReal().normalize({});assert.equal(krediya.status,'INCOMPLETE');assert.equal(krediya.record,null);
});

test('adaptadores aceptan encabezados exactos observados en Drive sin retener PII',()=>{
  const payjoy=new PayJoyAdapterReal().normalize({device:'DEVICE-X','owed by PayJoy':500000,'national id':'PII-NO-COPIAR'});assert.equal(payjoy.record.external_obligation_id,'payjoy:DEVICE-X');assert.equal(payjoy.record.original_amount,500000);assert.equal(JSON.stringify(payjoy.record).includes('PII-NO-COPIAR'),false);
  const alo=new AloAdapterReal().normalize({CONTRATO2:'CONTRACT-X',MONTO_CREDITO:600000,IDENTIFICACION:'PII-NO-COPIAR'});assert.equal(alo.record.external_obligation_id,'alo:CONTRACT-X');assert.equal(alo.record.original_amount,600000);assert.equal(JSON.stringify(alo.record).includes('PII-NO-COPIAR'),false);
});

test('fuente KORA solo expone lectura y el sync rechaza contratos incompletos',async()=>{
  let reads=0,writes=0;const source=new KoraReadOnlySource(async table=>{reads++;assert.equal(table,'liquidation_operations');return [{...evidenced,plataforma:'payjoy'}]});
  assert.equal('insert' in source,false);assert.equal('update' in source,false);assert.equal('delete' in source,false);
  const result=await syncAnonymizedSnapshot({source,sandboxSink:{upsert:async row=>{writes++;return row}},adapters:{payjoy:new PayJoyAdapterReal()}});
  assert.deepEqual({reads,writes,accepted:result.accepted,rejected:result.rejected.length},{reads:1,writes:0,accepted:0,rejected:1});
});

test('clasifica los siete resultados de conciliación',()=>{
  const obligation={expected_payment:100,source_updated_at:'2026-08-25T12:00:00Z'},payment={amount:100};
  assert.equal(classifyReconciliation({obligation,payment}),'MATCH');
  assert.equal(classifyReconciliation({obligation,payment:null}),'PAYMENT_NOT_FOUND');
  assert.equal(classifyReconciliation({obligation:null,payment}),'OBLIGATION_NOT_FOUND');
  assert.equal(classifyReconciliation({obligation,payment:{amount:90}}),'AMOUNT_MISMATCH');
  assert.equal(classifyReconciliation({obligation,payment,duplicate:true}),'DUPLICATE_PAYMENT');
  assert.equal(classifyReconciliation({obligation,payment,sourceUpdatedAt:'2026-08-24T12:00:00Z'}),'STALE_SOURCE');
  assert.equal(classifyReconciliation({obligation,payment,referenceMatches:2}),'AMBIGUOUS_REFERENCE');
});

test('pago parcial no se interpreta como pago completo y Ya pague no toca saldo',()=>{
  const obligation={expected_payment:200000,outstanding_balance:500000};const report={amount:50000,status:'PENDING_VALIDATION'};
  assert.equal(classifyReconciliation({obligation,payment:report}),'AMOUNT_MISMATCH');assert.equal(obligation.outstanding_balance,500000);assert.equal(report.status,'PENDING_VALIDATION');
});

test('obligación pagada nunca es elegible para recordatorio',()=>{assert.equal(isReminderEligible({status:'PAID',outstanding_balance:0}),false);assert.equal(isReminderEligible({status:'ACTIVE',outstanding_balance:100}),true);});

test('sandbox sync acepta solo estructura anonimizada completa y audita',async()=>{
  const full=Object.fromEntries(['external_obligation_id','customer_external_id','platform','store_id','currency','original_amount','outstanding_balance','installment_amount','due_date','status','days_past_due','last_payment_at','last_payment_amount','reconciliation_status','source_updated_at'].map(key=>[key,key.includes('amount')||key==='outstanding_balance'||key==='days_past_due'?1:'fixture']));
  let writes=0,audits=0;const result=await syncAnonymizedSnapshot({source:new KoraReadOnlySource(async()=>[{external_id:'SAFE-1',plataforma:'payjoy',anonymized:true}]),adapters:{payjoy:{normalize:()=>({status:'COMPLETE',record:full,gaps:[]})}},sandboxSink:{upsert:async row=>{writes++;return row},audit:async()=>{audits++}}});
  assert.deepEqual({accepted:result.accepted,writes,audits},{accepted:1,writes:1,audits:1});
});

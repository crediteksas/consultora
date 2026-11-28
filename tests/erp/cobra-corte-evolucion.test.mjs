import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const D=createRequire(import.meta.url)('../../creditek/erp/cobra-evolution-domain.js');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const row=(n,paid,cycled,overdue,other={})=>({operation_id:id(n),contract:`ejemplo${n}`,document:`${n}`,customer:`Cliente ${n}`,store:'Aliado de prueba',created:'2026-10-02',paid,cycled,overdue,total_installments:12,frequency:15,fee_cents:10000,financed_cents:100000,cycled_cents:cycled*10000,arrears_cents:overdue*10000,...other});
const cut=(n,date,rows)=>({id:id(n),cohort_month:'2026-10-01',cutoff:date,row_count:rows.length,observations:rows});
test('cuenta simultáneamente pagos reportados y variaciones de atraso por crédito',()=>{
 const a=cut(100,'2026-11-25',[row(1,0,1,1),row(2,1,1,0),row(3,0,1,1)]),b=cut(101,'2026-11-27',[row(1,1,1,0),row(2,1,2,1),row(3,1,2,1)]),r=D.compare(a,b);
 assert.deepEqual(r.movements,{paid_credits:2,paid_installments:2,more_overdue:1,less_overdue:1});assert.equal(r.previous.arrears,20000);assert.equal(r.current.arrears,20000);assert.equal(r.paymentTransactionsCreated,false);
 const both=r.changes.find(x=>x.operation_id===id(3));assert.equal(both.paidDelta,1);assert.equal(both.cycledDelta,1);assert.equal(both.overdueDelta,0);
});
test('no presenta como pagos las filas nuevas, ausentes o con términos cambiados',()=>{
 const a=cut(102,'2026-11-25',[row(4,0,1,1),row(5,0,1,1)]),b=cut(103,'2026-11-27',[row(4,1,1,0,{store:'Otra tienda'}),row(6,1,1,0)]),r=D.compare(a,b);
 assert.equal(r.movements.paid_installments,0);assert.equal(r.counts.review,1);assert.equal(r.counts.new,1);assert.equal(r.counts.absent,1);assert.equal(r.samePopulation,false);assert.equal(r.percentagePoints,null);
});

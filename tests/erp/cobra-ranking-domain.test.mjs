import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const D=createRequire(import.meta.url)('../../creditek/erp/cobra-evolution-domain.js');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const credit=(n,store,month,overdue=0)=>({operation_id:id(n),contract:`fake${n}`,document:`${n}`,customer:`Cliente ${n}`,store,created:month.slice(0,8)+'02',paid:1,cycled:1+overdue,overdue,total_installments:12,frequency:15,fee_cents:10000,financed_cents:100000,cycled_cents:(1+overdue)*10000,arrears_cents:overdue*10000});
const cut=(n,month,cutoff,observations,payload='a')=>({id:id(n),cohort_month:month,cutoff,received_at:cutoff+'T12:00:00Z',payload_sha256:payload,row_count:observations.length,observations});
const item=(credit,month,amount)=>({credit,month,kind:'installments',amount_pesos:amount,effective_date:null,source_name:'Ejemplo',source_row:2});
const report=items=>({version:1,invalid_dates:0,items,months:[]});
test('acumula meses usando el último corte y marca ausentes sin repetir créditos ni costos',()=>{
 const sep='2026-09-01',oct='2026-10-01';
 const earlier=cut(100,sep,'2026-11-10',[credit(1,'Aliado A',sep,1),credit(2,'Aliado A',sep,1)]);
 const later=cut(101,sep,'2026-11-20',[credit(1,'Aliado A',sep,0)]);
 const october=cut(102,oct,'2026-11-25',[credit(3,'Aliado A',oct,1),credit(4,'Aliado B',oct,0)]);
 const r=D.storeRanking([earlier,later,october],report([item('fake1',sep,50),item('fake3',oct,70),item('fake2',sep,30)]),'2026-11-27');
 const a=r.stores.find(x=>x.store==='Aliado A');assert.equal(a.credits.length,2);assert.equal(a.overdue,1);assert.equal(a.unknown.length,1);assert.equal(a.assessment,'Datos incompletos');assert.equal(a.cost_cents,12000);assert.equal(r.unassigned_cents,3000);assert.deepEqual(a.months_overdue,[oct]);
});
test('no mezcla costos del mismo identificador con otro mes y señala cortes viejos',()=>{
 const oct='2026-10-01',r=D.storeRanking([cut(103,oct,'2026-11-01',[credit(5,'Aliado B',oct,1)])],report([item('fake5','2026-09-01',90)]),'2026-11-27');assert.equal(r.unassigned_cents,9000);assert.equal(r.stores[0].cost_cents,0);assert.equal(r.stores[0].assessment,'Corte desactualizado');
});
test('no decide con versiones contradictorias ni con un crédito en dos meses',()=>{
 const sep='2026-09-01',oct='2026-10-01',a=cut(105,sep,'2026-11-20',[credit(6,'A',sep)],'a'),b=cut(106,sep,'2026-11-20',[credit(6,'A',sep,1)],'b');
 assert.throws(()=>D.storeRanking([a,b],report([]),'2026-11-27'),/dos versiones/);
 const c=cut(107,oct,'2026-11-25',[credit(6,'A',oct)]);assert.throws(()=>D.storeRanking([a,c],report([]),'2026-11-27'),/más de un mes/);
});
test('la etiqueta orientativa exige cinco créditos para alerta alta',()=>{
 const oct='2026-10-01',rows=Array.from({length:5},(_,i)=>credit(i+10,'A',oct,i<3?1:0));const r=D.storeRanking([cut(108,oct,'2026-11-25',rows)],report([]),'2026-11-27');assert.equal(r.stores[0].assessment,'Alerta alta');assert.equal(r.stores[0].ratio,0.6);
});
test('incluye usos ejecutados, pero deja posibles duplicados para revisión',()=>{
 const oct='2026-10-01',c=cut(109,oct,'2026-11-25',[credit(30,'A',oct,1),credit(31,'A',oct,1)]),fund={id:id(400),source_month:oct,available_cents:1000000},req=(n,operation)=>({id:id(n),event_no:n,kind:'request',amount_cents:10000,operation_id:operation,cohort_month:oct}),auth=(n,parent)=>({id:id(n),event_no:n,kind:'authorize',parent_id:id(parent),amount_cents:10000,allocations:[{fund_id:fund.id,cents:10000}]}),execute=(n,parent)=>({id:id(n),event_no:n,kind:'execute',parent_id:id(parent),amount_cents:10000,evidence:'soporte'});
 const book={fundings:[fund],actions:[req(100,id(30)),auth(101,100),execute(102,100),req(103,id(31)),auth(104,103),execute(105,103)]};const r=D.storeRanking([c],report([item('fake30',oct,50)]),'2026-11-27',book);assert.equal(r.stores[0].cost_cents,15000);assert.equal(r.possible_duplicates,1);assert.equal(r.unassigned_cents,10000);
});
test('un cambio de tienda conserva la observación pero no asigna el costo sin revisar',()=>{
 const m='2026-10-01',old=cut(110,m,'2026-11-10',[credit(32,'Tienda anterior',m,1)]),now=cut(111,m,'2026-11-25',[credit(32,'Tienda nueva',m,1)]);const r=D.storeRanking([old,now],report([item('fake32',m,50)]),'2026-11-27');assert.equal(r.stores[0].assessment,'Datos incompletos');assert.equal(r.stores[0].conflicts,1);assert.equal(r.unassigned_cents,5000);
});

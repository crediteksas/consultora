import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const context={globalThis:{},Intl,Date};
vm.runInNewContext(await readFile('creditek/erp/creditos-cartera-domain.js','utf8'),context);
const D=context.globalThis.KoraCreditPortfolioDomain;
const row={id:'one',cliente_id:'customer',outstanding_amount:100,status:'active',next_due_date:'2026-11-03'};
const event=(type,extra={})=>({id:'event',obligation_id:'one',created_at:'2026-11-03T10:00:00Z',event_type:type,...extra});
test('el día operativo usa Colombia aun cuando UTC cambió de fecha',()=>assert.equal(D.bogotaToday(new Date('2026-11-04T02:00:00Z')),'2026-11-03'));
test('datos incompletos nunca son señal de cartera al día',()=>{
 const x=D.collection({...row,cliente_id:null,next_due_date:null,outstanding_amount:null},[],'2026-11-03');
 assert.equal(x.reason,'Completar datos');assert.equal(x.days,null);assert.equal(x.missing.length,3);
 assert.equal(D.validDay('2026-02-30'),false);
});
test('vencimiento de hoy y antigüedad usan fechas sin mover el día',()=>{
 assert.equal(D.collection(row,[],'2026-11-03').reason,'Vence hoy');
 for(const [due,days,bucket] of [['2026-11-02',1,'1–7 días'],['2026-10-20',14,'8–30 días'],['2026-09-20',44,'31–60 días']]){
 const x=D.collection({...row,next_due_date:due},[],'2026-11-03');assert.equal(x.days,days);assert.equal(x.bucket,bucket);
 }
});
test('promesa vencida requiere verificación; no cambia estados ni saldos',()=>{
 const before=JSON.stringify(row),e=event('promise',{promise_date:'2026-11-02',promise_amount:50});
 assert.equal(D.collection(row,[e],'2026-11-03').reason,'Verificar promesa vencida');assert.equal(JSON.stringify(row),before);
 assert.equal(D.collection(row,[{...e,promise_date:'2026-11-03'}],'2026-11-03').reason,'Compromiso para hoy');
 assert.equal(D.collection(row,[{...e,promise_date:'2026-11-04'}],'2026-11-03').reason,'Compromiso próximo');
});
test('promesa cumplida posterior cierra el compromiso; una nueva vuelve a abrirlo',()=>{
 const events=[event('promise',{created_at:'2026-11-01T10:00:00Z',promise_date:'2026-11-02'}),event('promise_kept',{created_at:'2026-11-02T10:00:00Z'})];
 assert.equal(D.collection(row,events,'2026-11-03').promise,null);
 events.push(event('promise',{created_at:'2026-11-03T10:00:00Z',promise_date:'2026-11-05'}));
 assert.equal(D.collection(row,events,'2026-11-03').promise.promise_date,'2026-11-05');
});
test('reclamo no desaparece porque haya una nota; pagos cerrados no entran en agenda',()=>{
 assert.equal(D.collection(row,[event('dispute'),event('note',{created_at:'2026-11-04T10:00:00Z'})],'2026-11-03').reason,'Revisar reclamo');
 assert.equal(D.agenda([{...row,status:'paid'},row],[],'2026-11-03').length,1);
 assert.equal(D.collection(row,[{...event('promise'),obligation_id:'other'}],'2026-11-03').promise,null);
});
test('descarga y pantalla comparten el mismo filtro de agenda',()=>{
 const items=D.agenda([row,{...row,id:'missing',next_due_date:null}],[],'2026-11-03');
 assert.equal(D.selectAgenda(items,'today').length,1);
 assert.equal(D.selectAgenda(items,'data')[0].row.id,'missing');
 assert.equal(D.selectAgenda(items,'all').length,2);
});

test('cartera clasificada como pérdida permanece visible para revisión',()=>{const items=D.agenda([{...row,status:'loss'}],[],'2026-11-03');assert.equal(items.length,1);assert.equal(items[0].priority,1);assert.equal(items[0].reason,'Revisar cartera clasificada como pérdida');});

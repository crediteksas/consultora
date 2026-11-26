import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const D=require('../../releases/cobra-krediya-20261125/quality-domain.js');
const record=(overrides={})=>({'Fecha':'1/10/2026','# Crédito':'fake001','Cédula':'111001',Nombres:'Ana',Apellidos:'Ficticia',Tienda:'Tienda ficticia','Monto a Financiar':'$ 400.000,00','Monto Cuota':'$ 50.000,00','# Cuotas':12,'Frecuencia del Pago':15,'Cuotas cicladas':3,'Cuotas pagadas':1,'Cuotas atrasadas':2,'Estado del contrato':'FIRMADO','Estado de la solicitud':'Aprobado',...overrides});
const matrix=(records,headers=D.REQUIRED)=>[headers,...records.map(r=>headers.map(h=>r[h]??null))];
const parse=(records=[record()],cut='2026-11-20')=>D.parse(matrix(records),cut);
test('strict Colombian currency keeps cents and rejects ambiguous/unavailable values',()=>{
 assert.equal(D.cents('$ 1.234,56'),123456);assert.equal(D.cents(1234.56),123456);assert.equal(D.cents('0'),0);
 for(const v of [null,'','1,234.56','1.23','abc','-1',NaN,Infinity,1.001])assert.equal(D.cents(v),null,String(v));
});
test('invalid dates and Excel serials are rejected rather than guessed',()=>{
 assert.equal(D.date('29/2/2024'),'2024-02-29');assert.equal(D.date('29/2/2026'),null);assert.equal(D.date(45000),null);
 assert.equal(D.date('2026-02-30'),null);assert.equal(D.parse(matrix([record()]),'2026-02-30').rows.length,0);
});
test('date schedule follows every fifteen days including due today with zero calendar days',()=>{
 const result=parse([record({'Fecha':'21/10/2026','Cuotas cicladas':2,'Cuotas pagadas':1,'Cuotas atrasadas':1})]);
 assert.deepEqual(result.errors,[]);assert.equal(result.rows[0].expectedCycles,2);assert.equal(result.rows[0].calendarDue,'2026-11-20');assert.equal(result.rows[0].calendarDays,0);
});
test('same day loan without payments is not overdue',()=>{
 const p=parse([record({'Fecha':'20/11/2026','Cuotas cicladas':0,'Cuotas pagadas':0,'Cuotas atrasadas':0})]);assert.equal(p.rows[0].group,'no_overdue');assert.equal(D.summarize(p.rows).ratio,null);
});
test('counts define groups and a single payment does not imply delinquency',()=>{
 const p=parse([record({'# Crédito':'fake001','Cuotas cicladas':1,'Cuotas pagadas':1,'Cuotas atrasadas':0}),record({'# Crédito':'fake002'}),record({'# Crédito':'fake003','Cuotas pagadas':0,'Cuotas atrasadas':3})]);
 assert.equal(p.rows[0].group,'no_overdue');assert.equal(p.rows[1].group,'one');assert.equal(p.rows[2].group,'zero');assert.equal(D.summarize(p.rows).one,2);assert.equal(D.summarize(p.rows).oneOverdue,1);
});
test('whole-file validation prevents silently summing a partial import',()=>{
 const p=parse([record(),record({'# Crédito':'bad002','Monto Cuota':''})]);assert.ok(p.errors.length);assert.deepEqual(p.rows,[]);
});
test('duplicate contracts and duplicate/missing required headers block',()=>{
 assert.ok(parse([record(),record()]).errors.length);
 assert.ok(D.parse(matrix([record()],D.REQUIRED.slice(1)),'2026-11-20').errors.length);
 assert.ok(D.parse(matrix([record()],[...D.REQUIRED,'Fecha']),'2026-11-20').errors.length);
});
test('invalid counts, period, future dates, identity and overflowing amounts block',()=>{
 for(const changed of [{'Cuotas pagadas':''},{'Cuotas atrasadas':1},{'Cuotas cicladas':13},{'Cuotas pagadas':13},{'Frecuencia del Pago':30},{Fecha:'21/11/2026'},{'Cédula':''},{'Monto a Financiar':0},{'Monto Cuota':Number.MAX_SAFE_INTEGER/100}])assert.ok(parse([record(changed)]).errors.length,JSON.stringify(changed));
});
test('canceled credits require review, payment-status PAGADO is not client repayment',()=>{
 const h=[...D.REQUIRED,'Estado del Pago'];
 assert.ok(D.parse(matrix([record({'Estado del contrato':'ANULADO','Estado de la solicitud':'Aprobado'})],h),'2026-11-20').errors.length);
 const p=D.parse(matrix([record({'Estado del contrato':'FIRMADO','Estado de la solicitud':'Aprobado','Estado del Pago':'PAGADO'})],h),'2026-11-20');assert.equal(p.rows[0].paid,1);assert.equal(p.rows[0].overdue,2);
});
test('reported cycle disagreement is visible and does not overwrite provider counts',()=>{
 const p=parse([record({'Cuotas cicladas':2,'Cuotas atrasadas':1})]);assert.equal(p.warnings.length,1);assert.equal(p.rows[0].cycled,2);assert.equal(p.rows[0].expectedCycles,3);
});
test('weighted quality uses cents, including all groups, not average store rates',()=>{
 const p=parse([record({'Monto Cuota':'$ 100,50'}),record({'# Crédito':'fake002','Monto Cuota':'$ 900,00','Cuotas pagadas':3,'Cuotas atrasadas':0})]);const s=D.summarize(p.rows);assert.equal(s.arrearsCents,20100);assert.equal(s.cycledCents,300150);assert.equal(s.ratio,20100/300150);
});
test('strict target stays unachieved at precisely 22 percent',()=>{
 const base={...parse().rows[0],cycledCents:10000,arrearsCents:2200};assert.equal(D.summarize([base]).targetMetEstimated,false);assert.equal(D.summarize([{...base,arrearsCents:2199}]).targetMetEstimated,true);
});
test('filters do not mutate cohort and preserve source values',()=>{
 const rows=parse([record(),record({'# Crédito':'fake002',Tienda:'Otra tienda'})]).rows;
 assert.equal(D.select(rows,{query:'FICTICIA',store:'Otra tienda'}).length,1);assert.equal(rows.length,2);
});
test('reconciliation matches an existing liquidation even when collection record is absent',()=>{
 const rows=parse().rows,ref={platform:'krediya',contract:'fake001',document:'111001',created:'2026-10-01',store:'Tienda ficticia',customer:'Ana Ficticia',financed_amount:400000,operation_id:'fiction-op',obligation_id:null};
 const result=D.reconcile(rows,[ref]);assert.equal(result[0].linkState,'matched');assert.equal(result[0].reference.operation_id,'fiction-op');assert.equal(result[0].reference.obligation_id,null);
});
test('ambiguous and inconsistent references cannot create a client or authorization link',()=>{
 const rows=parse().rows,ref={platform:'krediya',contract:'fake001',document:'111001',created:'2026-10-01',store:'Tienda ficticia',customer:'Ana Ficticia',financed_amount:400000};
 assert.equal(D.reconcile(rows,[ref,ref])[0].linkState,'ambiguous');
 for(const change of [{document:'222002'},{created:'2026-10-02'},{financed_amount:1},{customer:'Otro Cliente'}])assert.equal(D.reconcile(rows,[{...ref,...change}])[0].linkState,'review');
 assert.equal(D.reconcile(rows,[{...ref,platform:'otra'}])[0].linkState,'missing');
});
test('cut comparison preserves absence and never synthesizes a payment',()=>{
 const before=parse([record(),record({'# Crédito':'fake002'})]).rows,after=parse([record({'Cuotas pagadas':2,'Cuotas atrasadas':1})]).rows;
 const changes=D.compareCuts(before,after);assert.equal(changes[0].state,'count_increased');assert.equal(changes[1].state,'absent');assert.equal('paymentAmount' in changes[0],false);
});
test('changed credit terms, declining counts and reversed cutoff order require review',()=>{
 const b=parse().rows;const a=parse([record({'Cuotas pagadas':0,'Cuotas atrasadas':3})]).rows;assert.equal(D.compareCuts(b,a)[0].state,'review');assert.equal(D.compareCuts(b,[{...b[0],feeCents:1}])[0].state,'review');assert.throws(()=>D.compareCuts(b,[{...b[0],cutoff:'2026-11-19'}]));
});
test('customer profile reuses identity, counts distinct contracts and retains missing authorization',()=>{
 const rows=parse([record(),record({'# Crédito':'fake002'})]).rows.map(r=>({...r,linkState:'matched',reference:{operation_id:'op-'+r.contract,nova_decision_id:null}}));const p=D.customerProfiles(rows);assert.equal(p.length,1);assert.equal(p[0].summary.credits,2);assert.equal(p[0].authorizationLinks,0);assert.throws(()=>D.customerProfiles([...rows,rows[0]]));assert.equal(D.customerProfiles(rows.map(r=>({...r,linkState:'review'}))).length,0);
});
test('formatted documents and database decimal amounts reconcile without confusing locales',()=>{
 const row=parse([record({'Cédula':'1.111.001'})]).rows;
 const ref={platform:'krediya',contract:'fake001',document:'1111001',customer:'Ana Ficticia',store:'Tienda ficticia',created:'2026-10-01',financed_amount:'400000.000000',operation_id:'fiction-op'};
 assert.equal(D.reconcile(row,[ref])[0].linkState,'matched');
 assert.equal(D.reconcile(row,[{...ref,financed_amount:'400000.000001'}])[0].linkState,'review');
 assert.ok(parse([record({'Cédula':'11.11.001'})]).errors.length);
});

test('mandatory status columns, empty and unknown states block; Unicode headers normalize',()=>{
 for(const key of ['Estado del contrato','Estado de la solicitud']){
  assert.ok(D.parse(matrix([record()],D.REQUIRED.filter(h=>h!==key)),'2026-11-20').errors.length);
  assert.ok(parse([record({[key]:''})]).errors.length);
  assert.ok(parse([record({[key]:'desconocido'})]).errors.length);
 }
 const m=matrix([record()]);m[0]=m[0].map(h=>h.normalize('NFD'));assert.equal(D.parse(m,'2026-11-20').rows.length,1);
});
test('rounding never labels just-below and just-above 22 as exactly 22',()=>{
 const base={...parse().rows[0],cycledCents:1000000};
 assert.equal(D.formatRatio(D.summarize([{...base,arrearsCents:219999}])),'< 22 %');
 assert.equal(D.formatRatio(D.summarize([{...base,arrearsCents:220001}])),'> 22 %');
 assert.match(D.formatRatio(D.summarize([{...base,arrearsCents:220000}])),/22,00/);
});
test('identity, financed amount and cycled decrease override apparent payment progress',()=>{
 const b=parse().rows;
 for(const change of [{document:'222002'},{customer:'Otra Persona'},{store:'Otra tienda'},{financedCents:1},{cycled:2}]){
  const a={...b[0],paid:2,overdue:1,...change};assert.equal(D.compareCuts(b,[a])[0].state,'review');
 }
 assert.equal(D.compareCuts(b,[{...b[0],cycled:4,overdue:3}])[0].state,'schedule_changed');
});
test('same-day observations are comparable and missing operation identifier cannot link',()=>{
 const b=parse().rows;assert.equal(D.compareCuts(b,b)[0].state,'same');
 const ref={platform:'krediya',contract:'fake001',document:'111001',created:'2026-10-01',store:'Tienda ficticia',customer:'Ana Ficticia',financed_amount:400000};
 assert.equal(D.reconcile(b,[ref])[0].linkState,'review');
});
test('customer observations do not contain a portfolio target or automated decision',()=>{
 const r=parse().rows.map(r=>({...r,linkState:'matched',reference:{operation_id:'fiction-op'}}));
 const p=D.customerProfiles(r)[0];assert.equal('ratio' in p.summary,false);assert.equal('targetMetEstimated' in p.summary,false);assert.equal('decision' in p,false);
});

test('coverage uses identical normalization and never silently drops missing same-store contracts',()=>{
 const refs=[{platform:'KrediYA',contract:' fake001 ',created:'2026-10-01',store:' TIENDA   FICTICIA '},{platform:'krediya',contract:'fake002',created:'2026-10-01',store:'Tienda ficticia'}];
 const c=D.coverage(parse().rows,refs,{month:'2026-10',store:'Tienda ficticia'});assert.equal(c.expected,2);assert.equal(c.missing,1);assert.equal(c.complete,false);
 assert.equal(D.coverage(parse().rows,refs.slice(0,1),{month:'2026-10',store:'Tienda ficticia'}).complete,true);
});
test('invalid, duplicate and unexpected reference contracts never certify complete coverage',()=>{
 const r={platform:'krediya',contract:'fake001',created:'2026-10-01',store:'Tienda ficticia'};
 for(const refs of [[r,{...r,created:123}],null,[r,r],[{...r,contract:'fake002'}]])assert.equal(D.coverage(parse().rows,refs,{month:'2026-10'}).complete,false);
 assert.equal(D.coverage(parse().rows,[r,{...r,created:123}],{month:'2026-10'}).invalid,1);
});
test('coverage handles ten thousand matched references without nested row matching',()=>{
 const cohort=Array.from({length:10000},(_,i)=>({contract:'fake'+i}));const refs=cohort.map(r=>({...r,platform:'krediya',created:'2026-10-01',store:'Tienda ficticia'}));
 const result=D.coverage(cohort,refs,{month:'2026-10'});assert.equal(result.expected,10000);assert.equal(result.complete,true);
});
test('formatted documents remain searchable and mask the last four actual digits',()=>{
 const rows=parse([record({'Cédula':'1.111.001'})]).rows;assert.equal(D.select(rows,{query:'1111001'}).length,1);assert.equal(D.documentSuffix(rows[0].document),'1001');
});
test('padded reference dates cannot silently hide a missing contract from coverage',()=>{
 const r={platform:'krediya',contract:'fake001',created:'2026-10-01',store:'Tienda ficticia'};
 for(const created of [' 2026-10-01','2026-10-01\n']){
  const c=D.coverage(parse().rows,[r,{...r,contract:'fake002',created}],{month:'2026-10'});
  assert.equal(c.complete,false);assert.equal(c.invalid,1);
 }
});

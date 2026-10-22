import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const window={location:{pathname:'/cartera',search:''}};
const context=vm.createContext({window,Intl,Date});
for(const file of ['cuenta-corriente-domain.js','cartera-b2b-domain.js','cartera-b2b-report.js'])vm.runInContext(readFileSync('creditek/erp/'+file,'utf8'),context);
const D=window.CreditekCarteraB2BDomain,R=window.KoraCarteraB2BReport;
const customers=[{cliente_codigo:'A',cliente:'Cliente ficticio A'},{cliente_codigo:'B',cliente:'Cliente ficticio B'}];
const movements=[
  {id:'anterior',tienda_codigo:'A',tipo:'cargo',fecha:'2026-08-31',monto:100.25},
  {id:'inicial',tienda_codigo:'A',tipo:'cargo',fecha:'2026-09-02',fecha_corte:'2026-09-01',monto:200,referencia_tipo:'saldo_inicial'},
  {id:'cargo',tienda_codigo:'A',tipo:'cargo',fecha:'2026-09-15',monto:400.50,concepto:'Remisión ficticia'},
  {id:'abono',tienda_codigo:'A',tipo:'abono',fecha:'2026-09-30',monto:50.25,concepto:'Abono ficticio'},
  {id:'ajuste',tienda_codigo:'A',tipo:'abono',fecha:'2026-09-21',monto:25.10,referencia_tipo:'ajuste_auditoria_b2b',concepto:'Ajuste ficticio'},
  {id:'otro',tienda_codigo:'B',tipo:'abono',fecha:'2026-09-21',monto:100.10,concepto:'Otro cliente'},
  {id:'futuro',tienda_codigo:'A',tipo:'cargo',fecha:'2026-10-01',monto:9999,concepto:'Fuera del período'},
];
const build=(mode='detailed',code='A')=>R.build({summaries:D.resumir(customers,movements,'2026-09-01','2026-09-30',code),movements,from:'2026-09-01',to:'2026-09-30',mode});
test('detalle usa solo el cliente consultado y el período, conserva centavos y signos',()=>{
  const r=build(),summary=r.tables[0].rows[0],detail=r.tables.at(-1);
  assert.deepEqual(Array.from(summary.slice(1)),[300.25,400.5,50.25,-25.1,625.4]);
  assert.equal(detail.rows.length,3);
  assert.equal(detail.rows.find(row=>row.at(-1)==='ajuste')[5],-25.1);
  assert.doesNotMatch(JSON.stringify(r),/Otro cliente|Fuera del período/);
  assert.equal(detail.rows[0][0].toISOString(),'2026-09-30T00:00:00.000Z');
});
test('resumido contiene solo totales y el cierre coincide con el detallado',()=>{
  const summary=build('summary'),detail=build();
  assert.equal(summary.tables.length,1);
  assert.equal(JSON.stringify(summary.tables[0]),JSON.stringify(detail.tables[0]));
  assert.doesNotMatch(JSON.stringify(summary),/Remisión ficticia|Abono ficticio|ID de movimiento/);
});
test('la carga inicial no es un cargo nuevo y el cierre de composición suma una sola vez',()=>{
  const r=build(),initial=r.tables[1],detail=r.tables[2];
  assert.equal(initial.totalRows[0][2],300.25);
  assert.equal(initial.rows[1][2],200);
  assert.equal(initial.rows[1][3].toISOString(),'2026-09-01T00:00:00.000Z');
  assert.equal(detail.totalRows[0][3],400.5);
  assert.equal(detail.totalRows[0][4],50.25);
  assert.equal(detail.totalRows[0][5],-25.1);
});
test('varios clientes mantienen por cobrar y a favor separados sin compensarlos',()=>{
  const r=build('summary',''),balances=r.tables[1];
  assert.equal(balances.rows[1][1],625.4);assert.equal(balances.rows[1][2],100.1);
  assert.equal(r.tables[0].totalRows[0][5],525.3);
});
test('período vacío válido conserva saldo inicial y no inventa movimientos',()=>{
  const summaries=D.resumir(customers,movements,'2026-10-02','2026-10-03','B');
  const r=R.build({summaries,movements,from:'2026-10-02',to:'2026-10-03'});
  assert.equal(r.tables.at(-1).rows.length,0);assert.equal(r.tables[0].rows[0][5],-100.1);
  assert.equal(r.tables.at(-1).totalRows[0][3],0);
});
test('fecha inválida o cliente inexistente no producen un informe vacío',()=>{
  assert.throws(()=>R.build({summaries:[],movements,from:'2026-09-01',to:'2026-09-30'}),/válido/);
  assert.throws(()=>R.build({summaries:customers,movements,from:'2026-10-01',to:'2026-09-30'}),/válido/);
});

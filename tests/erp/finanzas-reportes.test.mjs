import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url), XLSX=require('xlsx');
const ctx={Intl};ctx.globalThis=ctx;
for(const file of ['finanzas-programadas-domain.js','finanzas-reportes.js']) vm.runInNewContext(readFileSync(new URL('../../creditek/erp/'+file,import.meta.url),'utf8'),ctx);
const D=ctx.KoraFinancialDomain,R=ctx.KoraFinancialReports;
const row={id:'test-id',due_date:'2026-09-14',business_unit:'b2b',category:'contador',concept:'Prueba',beneficiary:'Beneficiaria de prueba',beneficiary_document:'00123456',destination_account:'Banco de prueba · Ahorros · 001234567890',amount:800000,status:'aprobado'};
test('Excel real: columnas, cuentas e identificaciones como texto y valor numérico',()=>{
  const original=JSON.stringify(row),book=R.workbook([row],D,XLSX);
  const roundtrip=XLSX.read(XLSX.write(book,{type:'buffer',bookType:'xlsx'}),{type:'buffer'}).Sheets.Movimientos;
  assert.equal(roundtrip.H2.v,'00123456');assert.equal(roundtrip.K2.v,'001234567890');assert.equal(roundtrip.K2.t,'s');assert.equal(roundtrip.M2.v,800000);assert.equal(roundtrip.M2.t,'n');assert.equal(roundtrip.I2.v,'Banco de prueba');assert.equal(JSON.stringify(row),original);
});
test('exportación conserva texto y no crea fórmulas con contenido del usuario',()=>{
  const sheet=R.workbook([{...row,concept:'=HYPERLINK("https://example.com")'}],D,XLSX).Sheets.Movimientos;
  assert.equal(sheet.F2.t,'s');assert.equal(sheet.F2.f,undefined);
});
test('orden incluye exclusivamente aprobados, no pagados ni pendientes',()=>{
  const rows=[row,{...row,id:'paid',status:'pagado'},{...row,id:'pending',status:'pendiente_aprobacion'}];
  assert.equal(R.approvedRows(rows).length,1);assert.match(R.reportBody(rows,D),/001234567890/);assert.doesNotMatch(R.reportBody(rows,D),/>paid</);
});
test('orden falla explícitamente si no hay cuenta completa o valor válido',()=>{
  for(const patch of [{destination_account:null},{destination_account:'correo@example.com'},{amount:0},{amount:'bad'},{beneficiary_document:''}])assert.throws(()=>R.approvedRows([{...row,...patch}]),/requiere verificar/);
  assert.throws(()=>R.approvedRows([{...row,status:'pagado'}]),/No hay movimientos aprobados/);
});
test('destino antiguo se conserva en informe, no se inventa banco ni cuenta',()=>{
  const data=R.table([{...row,destination_account:'1234567890'}],D)[1];assert.equal(data[8],'');assert.equal(data[10],'');assert.equal(data[11],'1234567890');
});
test('HTML escapa contenido y genera solo lectura sin marcar pagos',()=>{
  const html=R.reportBody([{...row,concept:'<script>alert(1)</script>'}],D);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
  const source=readFileSync(new URL('../../creditek/erp/finanzas-reportes.js',import.meta.url),'utf8');assert.doesNotMatch(source,/\.rpc\(|\.update\(|window\.open/);assert.match(source,/dialog\.showModal\(\)/);
});
test('la orden unificada abre dentro de KORA y consulta todos los pagos sin filtros parciales',()=>{
  const source=readFileSync(new URL('../../creditek/erp/aliados-tesoreria-app.js',import.meta.url),'utf8');
  const report=source.slice(source.indexOf('  async function paymentReport()'),source.indexOf('  async function changeMovement'));
  assert.match(report,/reportDialog\.showModal\(\)/);assert.match(report,/contentWindow/);assert.doesNotMatch(report,/window\.open/);
  assert.match(report,/await load\(\)/);assert.match(report,/CreditekPagosUnificados.reportRows/);assert.match(report,/missingPaymentData/);assert.doesNotMatch(report,/filtered\(data.payments/);
});

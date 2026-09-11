import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const domainSource=await readFile(new URL('../../creditek/erp/finanzas-programadas-domain.js',import.meta.url),'utf8');
const accessSource=await readFile(new URL('../../creditek/erp/kora-access-control.js',import.meta.url),'utf8');
const migration=await readFile(new URL('../../supabase/migrations/20260911151414_obligaciones_recurrentes_y_retiros_por_negocio.sql',import.meta.url),'utf8');
const html=await readFile(new URL('../../creditek/erp/finanzas-programadas.html',import.meta.url),'utf8');
const app=await readFile(new URL('../../creditek/erp/finanzas-programadas-app.js',import.meta.url),'utf8');

const domainContext={Intl};domainContext.globalThis=domainContext;vm.runInNewContext(domainSource,domainContext);
const D=domainContext.KoraFinancialDomain;

function accessFor(profile){const context={window:{}};vm.runInNewContext(accessSource,context);return context.window.KoraAccessControl;}

test('separa gastos Retail del control general y retiros',()=>{
  const rows=[
    {scope:'retail_store',business_unit:'retail',entry_type:'gasto',status:'pagado',amount:100},
    {scope:'business_general',business_unit:'b2b',entry_type:'gasto',status:'pagado',amount:200},
    {scope:'business_general',business_unit:'b2b',entry_type:'retiro_utilidad',status:'pagado',amount:300},
  ];
  const retail=D.filterEntries(rows,{scope:'retail_store'}),general=D.filterEntries(rows,{scope:'business_general'});
  assert.equal(retail.length,1);assert.equal(general.length,2);
  assert.deepEqual(JSON.parse(JSON.stringify(D.summarize(general))),{count:2,pending:0,expenses:200,paidExpenses:200,withdrawals:300,paidWithdrawals:300});
});

test('presenta una o dos fechas y trata 31 como fin de mes',()=>{
  assert.equal(D.recurrenceLabel([15]),'día 15');
  assert.equal(D.recurrenceLabel([31,15]),'día 15 y fin de mes');
});

test('solo Maite y Oscar ven y abren las dos entradas financieras',()=>{
  const maite={id:'d1782db6-bacc-4caf-af6f-ce1b8d1c0391',rol:'auditoria',activo:true};
  const oscar={id:'6de0ad26-64af-4966-8cd9-d468880af627',rol:'gerencia',activo:true};
  const other={id:'00000000-0000-0000-0000-000000000003',rol:'auditoria',activo:true};
  for(const profile of [maite,oscar]){
    const access=accessFor(profile);assert.equal(access.authorize(profile,'finanzas-programadas.html').allowed,true);
    const labels=access.navigationFor(profile,{aliados:true}).flatMap(section=>section.items.map(item=>item.label));
    assert.ok(labels.includes('Gastos periódicos'));assert.ok(labels.includes('Gastos y retiros'));
  }
  const access=accessFor(other);assert.equal(access.authorize(other,'finanzas-programadas.html').allowed,false);
  assert.ok(!access.navigationFor(other,{aliados:true}).flatMap(section=>section.items.map(item=>item.label)).includes('Gastos y retiros'));
});

test('la migración no toca utilidades, ventas, caja ni liquidaciones existentes',()=>{
  assert.match(migration,/entry_type in \('gasto','retiro_utilidad'\)/);
  assert.match(migration,/scope in \('retail_store','business_general'\)/);
  assert.match(migration,/kora-financial-recurring-daily/);
  assert.match(migration,/Solo Oscar puede aprobar o rechazar movimientos/);
  assert.doesNotMatch(migration,/(update|delete from|insert into) public\.(ventas|gastos|aliados_gastos_operativos|liquidations|payment_orders|treasury_movements)/i);
});

test('la interfaz conserva separación, informe por fechas y soporte de pago',()=>{
  assert.match(app,/Gastos periódicos de Retail/);assert.match(app,/Gastos y retiros/);
  assert.match(html,/id="from"/);assert.match(html,/id="to"/);assert.match(html,/Descargar informe/);
  assert.match(app,/entry_type==='retiro_utilidad'/);assert.match(app,/storage\.from\('soportes'\)\.upload/);
  assert.match(app,/Estos gastos no se mezclan con los gastos diarios de caja ni modifican la utilidad de la tienda/);
});

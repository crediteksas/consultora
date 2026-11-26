import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const domain = require('../../creditek/erp/aliados-tesoreria-domain.js');
const migrationPath = 'creditek/erp/migrations/20260805_tesoreria_tercerizacion_b2b.sql';
const rollbackPath = 'creditek/erp/migrations/rollback/20260805_tesoreria_tercerizacion_b2b_rollback.sql';

test('separa crédito recibido, compensación B2B y comisión de Tercerización', () => {
  assert.deepEqual(domain.destinoRetail({ valorCredito:500000,inicial:200000,valorComercial:700000,porcentaje:.76 }), {
    recibidoPlataforma:500000,derechoRetail:532000,compensacionB2B:332000,comisionTercerizacion:168000,
  });
  assert.deepEqual(domain.destinoAliado({ valorCredito:500000,inicial:200000,valorComercial:700000,porcentaje:.77 }), {
    recibidoPlataforma:500000,derechoAliado:539000,pagoNetoAliado:339000,comisionTercerizacion:161000,
  });
});

test('saldo B2B conserva excedentes como saldo a favor', () => {
  assert.deepEqual(domain.aplicarCompensacion({ deuda:500000,compensacion:332000 }), { saldoAntes:500000,saldoDespues:168000,saldoFavor:0 });
  assert.deepEqual(domain.aplicarCompensacion({ deuda:200000,compensacion:332000 }), { saldoAntes:200000,saldoDespues:-132000,saldoFavor:132000 });
});

test('movimientos no pueden consumir otra unidad ni superar disponibilidad', () => {
  assert.equal(domain.validarMovimiento({ unidad:'b2b',tipo:'pago_proveedor',valor:100,saldo:100 }).ok,true);
  assert.equal(domain.validarMovimiento({ unidad:'tercerizacion',tipo:'pago_proveedor',valor:100,saldo:100 }).ok,false);
  assert.equal(domain.validarMovimiento({ unidad:'b2b',tipo:'retiro_socios',valor:100,saldo:100 }).ok,false);
  assert.equal(domain.validarMovimiento({ unidad:'tercerizacion',tipo:'retiro_socios',valor:101,saldo:100 }).ok,false);
});

test('la migración reutiliza pagos y cuenta corriente con saldos e idempotencia separados', async () => {
  const sql = await readFile(migrationPath,'utf8');
  for (const fragment of ['payment_orders','payment_items','liquidation_beneficiaries','beneficiary_bank_accounts','cuenta_corriente','treasury_unit_balances','treasury_movements','retail_b2b_compensations','idempotency_key','balance_before','balance_after']) assert.match(sql,new RegExp(fragment));
  assert.match(sql,/referencia_tipo[\s\S]{0,300}'compensacion_liquidacion_retail'/);
  assert.match(sql,/unique\s*\(operation_id\)/i);
  assert.doesNotMatch(sql,/distribuci[oó]n de utilidades retail/i);
});

test('aprobar produce destinos una sola vez y nunca crea pago bancario Retail', async () => {
  const sql = await readFile(migrationPath,'utf8');
  assert.match(sql,/tesoreria_generar_destinos_liquidacion/);
  assert.match(sql,/liquidation_treasury_destinations_unique/);
  assert.match(sql,/delete from public\.payment_items[\s\S]*concepto='pago_tienda'/);
  assert.match(sql,/not \(v_future and o\.tipo_establecimiento='propia'\)/);
  assert.match(sql,/insert into public\.retail_b2b_compensations/);
  assert.match(sql,/insert into public\.cuenta_corriente/);
  assert.match(sql,/on conflict\s*\(operation_id\) do nothing/i);
});

test('pagos reales exigen soporte y emiten eventos sin información interna', async () => {
  const sql = await readFile(migrationPath,'utf8');
  assert.match(sql,/No se puede marcar Pagado sin soporte/);
  assert.match(sql,/treasury\.ally_payment_completed/);
  assert.match(sql,/treasury\.executive_payment_completed/);
  assert.doesNotMatch(sql,/payload[^;]*(utilidad_creditek|saldo_b2b|retiro_socios)/i);
});

test('retiros requieren autorización de Óscar y pagos de proveedor reutilizan el RPC existente', async () => {
  const sql = await readFile(migrationPath,'utf8');
  assert.match(sql,/m\.type='retiro_socios'[\s\S]*tiene_capacidad_aliados\('aprobador'\)/);
  assert.match(sql,/registrar_pago_proveedor/);
  assert.match(sql,/tesoreria_registrar_movimiento/);
});

test('rollback es no destructivo y bloquea si existen movimientos conciliados', async () => {
  const rollback = await readFile(rollbackPath,'utf8');
  assert.match(rollback,/Rollback bloqueado/);
  assert.doesNotMatch(rollback,/delete from public\.(liquidations|liquidation_operations|cuenta_corriente|payment_orders)/i);
});

test('la interfaz concentra Tesorería en pagos, compensaciones y utilidad', async () => {
  const [html,app,sidebar,guard] = await Promise.all([
    readFile('creditek/erp/aliados-tesoreria.html','utf8'),readFile('creditek/erp/aliados-tesoreria-app.js','utf8'),
    readFile('creditek/erp/sidebar.js','utf8'),readFile('creditek/erp/kora-access-control.js','utf8'),
  ]);
  for (const label of ['Pagos a Aliados','Pagos a Ejecutivos','Abonos pendientes de aplicar a cartera','Histórico de abonos aplicados']) assert.match(html,new RegExp(label));
  assert.doesNotMatch(html,/Otros movimientos de Tesorería|Registrar movimiento/);
  assert.match(sidebar,/Tesorería/);
  assert.match(guard,/aliados-tesoreria\.html/);
  assert.match(app,/window\.creditekSidebar/);
  assert.doesNotMatch(html,/UUID|JSON|service_role/i);
  assert.doesNotMatch(app,/service_role/i);
});

test('Tesorería diferencia saldo contable, compensaciones y utilidad real', async () => {
  const [html, app] = await Promise.all([
    readFile('creditek/erp/aliados-tesoreria.html', 'utf8'),
    readFile('creditek/erp/aliados-tesoreria-app.js', 'utf8'),
  ]);
  for (const text of [
    'Cómo leer estos saldos',
    'balanceGuide',
    'balance-guide',
    'Ver utilidad B2B por día',
    'Ver utilidad por liquidación',
  ]) assert.doesNotMatch(html, new RegExp(text));
  assert.doesNotMatch(app, /balanceGuide/);
  for (const text of [
    'Compensaciones Retail calculadas para B2B',
    'Compensaciones pendientes de aplicar a B2B',
    'Créditos contabilizados en Tercerización',
    'Débitos contabilizados en Tercerización',
    'Saldo neto contable de Tercerización',
  ]) assert.match(app, new RegExp(text));
  assert.doesNotMatch(app, /Saldo contable B2B disponible|Compensaciones aplicadas menos pagos B2B/);
  assert.match(app, /!x\.applied_at && !x\.reversed_at/);
  assert.match(app, /historicalNet - ledgerBalance/);
});

test('Tesorería abre actividad, histórico y compensaciones en el mes de Bogotá sin esconder arrastres', async () => {
  const [html, app] = await Promise.all([
    readFile('creditek/erp/aliados-tesoreria.html', 'utf8'),
    readFile('creditek/erp/aliados-tesoreria-app.js', 'utf8'),
  ]);
  assert.equal(domain.enMes('2026-10-06', '2026-10'), true);
  assert.equal(domain.enMes('2026-09-30', '2026-10'), false);
  assert.equal(domain.enMes('', '2026-10'), false);
  assert.match(domain.mesBogota(new Date('2026-10-01T02:00:00Z')), /2026-09/);
  assert.match(html, /id="metricMonth" type="month"/);
  assert.match(app, /\$\("#metricMonth"\)\.value = todayBogota\.slice\(0, 7\)/);
  assert.match(app, /\$\("#historyFrom"\)\.value = `\$\{todayBogota\.slice\(0, 7\)\}-01`/);
  assert.match(app, /\$\("#compensationFrom"\)\.value = `\$\{todayBogota\.slice\(0, 7\)\}-01`/);
  assert.match(app, /Pendientes al día de hoy · incluye arrastre/);
  assert.match(app, /Saldo contable actual · todos los meses/);
  assert.doesNotMatch(app, /Saldo neto de Tercerización disponible/);
});


test('utilidad reversada se distingue de una diferencia real sin cambiar saldos ni datos',async()=>{
  const app=await readFile('creditek/erp/aliados-tesoreria-app.js','utf8');
  const source=app.slice(app.indexOf('    const period = window.CreditekTesoreriaTercerizacion;'),app.indexOf('    $("#allyPayments").innerHTML'));
  const cop=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n);
  for(const {history,adjustments,net,difference} of [
    {history:1000,adjustments:[150,-30],net:880,difference:0},
    {history:1025,adjustments:[120],net:880,difference:25},
    {history:975,adjustments:[120],net:880,difference:-25},
    {history:1000,adjustments:[],net:1000,difference:0},
    {history:1025,adjustments:[-50],net:1000,difference:25},
  ]){
    const data={balances:[{unit:'tercerizacion',balance:1000}],reversions:adjustments.map(treasury_adjustment=>({treasury_adjustment})),payments:[],destinations:[],addiLiquidations:[],compensations:[],liquidations:[],movements:[
      {unit:'tercerizacion',direction:'credit',amount:history+100,status:'pagado',movement_date:'2026-11-10'},
      {unit:'tercerizacion',direction:'debit',amount:100,status:'conciliado',movement_date:'2026-11-10'},
      {unit:'tercerizacion',direction:'credit',amount:999,status:'pendiente',movement_date:'2026-11-10'},
      {unit:'b2b',direction:'credit',amount:999,status:'pagado',movement_date:'2026-11-10'},
    ]};
    const before=structuredClone(data),nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='#metricMonth'?'2026-11':'',innerHTML:''});return nodes.get(id);};
    const context={window:{CreditekTesoreriaTercerizacion:domain},data,$,cop,esc:String,isClosedPayment:()=>false};
    vm.runInNewContext('(()=>{'+source+';return out;})()',context);
    const cards=Object.fromEntries([...$('#metrics').innerHTML.matchAll(/<article[^>]*><small>([^<]*)<\/small><strong>([^<]*)<\/strong>/g)].map(m=>[m[1],m[2]]));
    assert.equal(cards['Saldo neto contable de Tercerización'],cop(net));
    const oldNet=Number(before.balances[0].balance)-Math.max(0,before.reversions.reduce((n,r)=>n+Number(r.treasury_adjustment),0));assert.equal(net,oldNet);
    const reversed=Math.max(0,adjustments.reduce((n,a)=>n+a,0));
    if(reversed>0){assert.equal(cards['Utilidad reversada por anulación'],cop(reversed));assert.match($('#metrics').innerHTML,/Ya descontada del saldo neto/);}else assert.ok(!('Utilidad reversada por anulación' in cards));
    if(difference)assert.equal(cards['Diferencia por conciliar · Tercerización'],cop(difference));else assert.ok(!('Diferencia por conciliar · Tercerización' in cards));
    assert.deepEqual(data,before);
  }
});

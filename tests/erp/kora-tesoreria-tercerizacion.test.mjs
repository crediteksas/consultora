import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

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
  for (const label of ['Pagos a Aliados','Pagos a Ejecutivos','Abonos automáticos a cartera de tiendas','Utilidad del negocio por créditos de tiendas propias']) assert.match(html,new RegExp(label));
  assert.doesNotMatch(html,/Otros movimientos de Tesorería|Registrar movimiento/);
  assert.match(sidebar,/Tesorería/);
  assert.match(guard,/aliados-tesoreria\.html/);
  assert.match(app,/window\.creditekSidebar/);
  assert.doesNotMatch(html,/UUID|JSON|service_role/i);
  assert.doesNotMatch(app,/service_role/i);
});

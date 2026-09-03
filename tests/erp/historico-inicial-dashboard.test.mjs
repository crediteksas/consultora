import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile('creditek/erp/aliados-v1-1-app.js', 'utf8');
const migration = await readFile('supabase/migrations/20260902235302_marcar_creditos_historicos_inicio_operacion.sql', 'utf8');
const utilityMigration = await readFile('supabase/migrations/20260903003000_calcular_resultado_historico_creditos.sql', 'utf8');
const correctionMigration = await readFile('supabase/migrations/20260903003358_corregir_utilidad_y_gastos_aliados.sql', 'utf8');

test('el dashboard separa el histórico inicial pagado de la operación nueva', () => {
  assert.match(app, /Histórico inicial — ya pagado/);
  assert.match(app, /No genera órdenes de pago ni exige soportes/);
  assert.match(app, /allRows\('creditos_historicos_plataforma'/);
});

test('no duplica la cuota inicial y descuenta bonos del resultado histórico', () => {
  assert.match(correctionMigration, /valor_comercial_historico-h\.pagamos_historico/);
  assert.match(correctionMigration, /utilidad_neta_historica/);
  assert.match(correctionMigration, /bono_universal',5000/);
  assert.match(app, /Utilidad histórica neta parcial/);
});

test('los gastos de aliados tienen aprobación, soporte y auditoría', async () => {
  const html = await readFile('creditek/erp/aliados-gastos.html', 'utf8');
  assert.match(html, /id="expenseForm"/);
  assert.match(html, /id="expenseSupport"/);
  assert.match(correctionMigration, /create table if not exists public\.aliados_gastos_operativos/);
  assert.match(correctionMigration, /aliados_decidir_gasto/);
  assert.match(correctionMigration, /audit_log/);
});

test('Krediya usa el bono histórico del archivo y Calidad permite asociar pendientes', async () => {
  const reconciliation = await readFile(new URL('../../supabase/migrations/20260903012427_reconciliar_krediya_y_asociacion_historica.sql', import.meta.url), 'utf8');
  const quality = await readFile(new URL('../../creditek/erp/aliados-calidad.html', import.meta.url), 'utf8');
  assert.match(reconciliation, /tipo_establecimiento='aliado' then 30000/i);
  assert.match(reconciliation, /aliados_asociar_historico/);
  assert.match(app, /Pendientes de asociación histórica/);
  assert.match(app, /data-historical-associate/);
  assert.match(quality, /aliados-v1-1-app\.js\?v=1\.1\.6/);
});

test('Plataformas y Ejecutivos distinguen histórico de operación nueva sin catálogos inventados', () => {
  assert.doesNotMatch(app, /Credilla|Plataforma iPhone/);
  assert.match(app, /Plataformas reales/);
  assert.match(app, /Créditos históricos asociados/);
  assert.match(app, /Históricos pendientes/);
  assert.match(app, /Utilidad histórica neta/);
});

test('calcula el resultado histórico sin crear pagos ni alterar caja', () => {
  assert.match(utilityMigration, /politica_actual_aplicada_retroactivamente/);
  assert.match(utilityMigration, /when tipo_establecimiento='propia' then 0\.76 else 0\.77/);
  assert.match(utilityMigration, /krediya_archivo_historico/);
  assert.doesNotMatch(utilityMigration, /insert into public\.(payment_orders|payment_items|liquidation_bonuses|movimientos_caja)/i);
  assert.match(app, /Utilidad histórica bruta/);
  assert.match(app, /Utilidad visible acumulada/);
  assert.match(app, /Bonos históricos/);
});

test('la carga inicial queda pagada, sin soporte y con corte operativo', () => {
  assert.match(migration, /historico_inicial = true/);
  assert.match(migration, /pagado_antes_inicio = true/);
  assert.match(migration, /requiere_soporte = false/);
  assert.match(migration, /fecha_inicio_operacion = date '2026-09-02'/);
  assert.match(migration, /on conflict \(plataforma, codigo_credito\) do update/);
});

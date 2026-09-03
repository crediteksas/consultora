import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile('creditek/erp/aliados-v1-1-app.js', 'utf8');
const migration = await readFile('supabase/migrations/20260902235302_marcar_creditos_historicos_inicio_operacion.sql', 'utf8');
const utilityMigration = await readFile('supabase/migrations/20260903003000_calcular_resultado_historico_creditos.sql', 'utf8');

test('el dashboard separa el histórico inicial pagado de la operación nueva', () => {
  assert.match(app, /Histórico inicial — ya pagado/);
  assert.match(app, /No genera órdenes de pago ni exige fotografías o soportes/);
  assert.match(app, /allRows\('creditos_historicos_plataforma'/);
});

test('calcula el resultado histórico sin crear pagos ni alterar caja', () => {
  assert.match(utilityMigration, /politica_actual_aplicada_retroactivamente/);
  assert.match(utilityMigration, /when tipo_establecimiento='propia' then 0\.76 else 0\.77/);
  assert.match(utilityMigration, /krediya_archivo_historico/);
  assert.doesNotMatch(utilityMigration, /insert into public\.(payment_orders|payment_items|liquidation_bonuses|movimientos_caja)/i);
  assert.match(app, /Utilidad histórica antes de bonos/);
  assert.match(app, /Utilidad visible acumulada/);
  assert.match(app, /Pago neto histórico/);
});

test('la carga inicial queda pagada, sin soporte y con corte operativo', () => {
  assert.match(migration, /historico_inicial = true/);
  assert.match(migration, /pagado_antes_inicio = true/);
  assert.match(migration, /requiere_soporte = false/);
  assert.match(migration, /fecha_inicio_operacion = date '2026-09-02'/);
  assert.match(migration, /on conflict \(plataforma, codigo_credito\) do update/);
});

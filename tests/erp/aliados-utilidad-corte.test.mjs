import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile('creditek/erp/aliados-v1-1-app.js', 'utf8');
const migration = await readFile('supabase/migrations/20260903030000_cerrar_utilidad_anterior_inicio_operacion.sql', 'utf8');

test('conserva la utilidad original y registra una contrapartida auditable', () => {
  assert.match(migration, /resultado_cerrado_historico/);
  assert.match(migration, /resultado_cerrado/);
  assert.match(migration, /aliados_cierres_utilidad/);
  assert.doesNotMatch(migration, /set\s+utilidad_(?:final_historica|neta_historica|creditek)\s*=\s*0/i);
});

test('el corte usa medianoche de Bogotá del 2 de septiembre', () => {
  assert.match(migration, /2026-09-02 00:00:00-05/);
  assert.match(migration, /fecha_credito\s*<\s*v_corte/);
  assert.match(migration, /operation_at\s*<\s*v_corte/);
});

test('los tableros muestran utilidad disponible neta del resultado cerrado', () => {
  assert.match(app, /historicalUtilityAvailable/);
  assert.match(app, /operationUtilityAvailable/);
  assert.match(app, /Resultado histórico cerrado/);
  assert.match(app, /Utilidad disponible/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile('supabase/migrations/20260904050451_corregir_inicio_operativo_aliados_al_1_septiembre.sql', 'utf8');

test('el corte corregido inicia el 1 de septiembre en Bogotá', () => {
  assert.match(migration, /2026-09-01 00:00:00-05/);
  assert.match(migration, /operation_at >= v_desde and operation_at < v_hasta/);
  assert.match(migration, /resultado_cerrado = 0/);
});

test('reclasifica como operación nueva los créditos del 1 de septiembre', () => {
  assert.match(migration, /historico_inicial = false/);
  assert.match(migration, /pagado_antes_inicio = false/);
  assert.match(migration, /requiere_soporte = true/);
  assert.match(migration, /fecha_inicio_operacion = date '2026-09-01'/);
});

test('la corrección queda limitada exactamente a las seis operaciones autorizadas', () => {
  assert.doesNotMatch(migration, /create or replace function/);
  assert.match(migration, /v_operaciones <> 6 or v_utilidad <> 1074800/);
});

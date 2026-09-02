import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile('creditek/erp/aliados-v1-1-app.js', 'utf8');
const migration = await readFile('supabase/migrations/20260902235302_marcar_creditos_historicos_inicio_operacion.sql', 'utf8');

test('el dashboard separa el histórico inicial pagado de la operación nueva', () => {
  assert.match(app, /Histórico inicial — ya pagado/);
  assert.match(app, /No genera órdenes de pago ni exige fotografías o soportes/);
  assert.match(app, /allRows\('creditos_historicos_plataforma'/);
});

test('la carga inicial queda pagada, sin soporte y con corte operativo', () => {
  assert.match(migration, /historico_inicial = true/);
  assert.match(migration, /pagado_antes_inicio = true/);
  assert.match(migration, /requiere_soporte = false/);
  assert.match(migration, /fecha_inicio_operacion = date '2026-09-02'/);
  assert.match(migration, /on conflict \(plataforma, codigo_credito\) do update/);
});

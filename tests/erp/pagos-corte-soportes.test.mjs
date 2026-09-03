import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(new URL('../../supabase/migrations/20260903192527_cerrar_pagos_historicos_antes_inicio_operacion.sql', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../../creditek/erp/aliados-tesoreria-app.js', import.meta.url), 'utf8');

test('solo la operación desde el 1 de septiembre exige soporte', () => {
  assert.match(migration, /fecha_inicio_operacion date not null default date '2026-09-01'/i);
  assert.match(migration, /where cutoff_snapshot < date '2026-09-01'[\s\S]*estado in \('pendiente', 'programado'\)/i);
  assert.match(migration, /historico_inicial = true,[\s\S]*requiere_soporte = false,[\s\S]*estado = 'pagado'/i);
  assert.match(migration, /where cutoff_snapshot >= date '2026-09-01'/i);
  assert.match(migration, /historico_inicial = false,[\s\S]*requiere_soporte = true/i);
});

test('Tesorería distingue el histórico cerrado de soportes pendientes', () => {
  assert.match(app, /if\(p\.historico_inicial\)return ''/);
  assert.match(app, /Histórico pagado/);
  assert.match(app, /Cerrado antes del inicio operativo · no requiere soporte/);
  assert.match(app, /Histórico pagado · sin soporte requerido/);
});

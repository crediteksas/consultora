import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile('creditek/erp/aliados-v1-1-app.js', 'utf8');
const html = await readFile('creditek/erp/aliados-plataformas.html', 'utf8');
const migration = await readFile('supabase/migrations/20260904142143_meta_alo_septiembre_aliados.sql', 'utf8');

test('registra la meta oficial de ALO Credit para septiembre', () => {
  assert.match(migration, /date '2026-09-01', date '2026-09-30', 60, 1200000/);
  assert.match(migration, /20000, 16, 'vigente'/);
  assert.match(migration, /gmail:1a069a9607b5b836/);
  assert.match(migration, /enable row level security/);
});

test('Plataformas muestra avance, condiciones e incentivo sin contabilizarlo', () => {
  assert.match(app, /aliados_metas_plataforma/);
  assert.match(app, /Seguimiento por fecha real de venta/);
  assert.match(app, /FPD7 máximo/);
  assert.match(app, /Incentivo potencial/);
  assert.match(app, /no contabilizado como utilidad/);
  assert.match(app, /miércoles 9 de septiembre/);
  assert.match(html, /aliados-v1-1-app\.js\?v=1\.1\.20/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile('creditek/erp/aliados-v1-1-app.js', 'utf8');
const html = await readFile('creditek/erp/aliados-plataformas.html', 'utf8');
const budgetHtml = await readFile('creditek/erp/aliados-presupuesto.html', 'utf8');
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
  assert.match(app, /Capacitación:/);
  assert.match(app, /g\.capacitacion_at/);
  assert.match(html, /aliados-v1-1-app\.js\?v=1\.1\.21/);
});

test('Gerencia puede cargar metas futuras sin inventar valores de PayJoy o Krediya', async () => {
  const managerMigration = await readFile('supabase/migrations/20260904143635_gestionar_metas_plataformas_aliados.sql', 'utf8');
  const hardenedMigration = await readFile('supabase/migrations/20260904144249_endurecer_auditoria_metas_plataformas.sql', 'utf8');
  assert.match(app, /Cargar o actualizar meta/);
  assert.match(app, /function renderBudget/);
  assert.match(budgetHtml, /data-aliados-view="budget"/);
  assert.match(budgetHtml, /Presupuesto de Aliados/);
  assert.match(app, /aliados_guardar_meta_plataforma/);
  assert.match(app, /profile\?\.rol!==\x27gerencia\x27/);
  assert.match(managerMigration, /tiene_capacidad_aliados\('aprobador'\)/);
  assert.match(managerMigration, /guardar_meta_plataforma/);
  assert.match(managerMigration, /insert into public\.audit_log/);
  assert.match(hardenedMigration, /security invoker/);
  assert.match(hardenedMigration, /revoke all on function public\.aliados_auditar_meta_plataforma\(\) from public, anon, authenticated/);
  assert.match(hardenedMigration, /create trigger aliados_metas_plataforma_auditoria/);
  assert.doesNotMatch(managerMigration, /values \(\s*'payjoy'/i);
  assert.doesNotMatch(managerMigration, /values \(\s*'krediya'/i);
});

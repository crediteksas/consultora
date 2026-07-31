import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../..');
const read = file => readFile(path.join(root, file), 'utf8');
const [sidebar, app, domainSource, sql] = await Promise.all([
  read('creditek/erp/sidebar.js'),
  read('creditek/erp/incidencias-app.js'),
  read('creditek/erp/kora-incident-domain.js'),
  read('creditek/erp/migrations/20260731_kora_incident_permissions.sql'),
]);
const normalizedSql = sql.toLowerCase().replace(/\s+/g, ' ');

test('elimina Mis incidencias de la navegación sin borrar su pantalla', async () => {
  assert.doesNotMatch(sidebar, /label:\s*'Mis incidencias'/);
  assert.match(sidebar, /label:\s*'Incidencias'/);
  assert.match(await read('creditek/erp/mis-reportes.html'), /Mis reportes/);
});

test('los permisos de dominio reflejan tienda, Maythe y Gerencia', () => {
  const context = {};
  vm.runInNewContext(domainSource, context);
  const domain = context.KoraIncidentDomain;

  for (const role of ['admin_tienda', 'asesor']) {
    assert.equal(domain.hasIncidentPermission(role, 'incident_view_store'), true);
    assert.equal(domain.hasIncidentPermission(role, 'incident_comment'), true);
    assert.equal(domain.hasIncidentPermission(role, 'incident_admin'), false);
    assert.equal(domain.hasIncidentPermission(role, 'incident_close'), false);
  }
  assert.equal(domain.hasIncidentPermission('auditoria', 'incident_view_all'), true);
  assert.equal(domain.hasIncidentPermission('auditoria', 'incident_create'), true);
  assert.equal(domain.hasIncidentPermission('auditoria', 'incident_comment'), false);
  assert.equal(domain.hasIncidentPermission('auditoria', 'incident_admin'), false);
  assert.equal(domain.hasIncidentPermission('gerencia', 'incident_admin'), true);
  assert.equal(domain.hasIncidentPermission('gerencia', 'incident_close'), true);
});

test('la migración limita administración y cierre a Gerencia', () => {
  assert.match(normalizedSql, /delete from public\.kora_incident_permissions/);
  assert.match(normalizedSql, /\('auditoria', 'incident_view_all'\)/);
  assert.match(normalizedSql, /\('auditoria', 'incident_create'\)/);
  assert.doesNotMatch(normalizedSql, /\('auditoria', 'incident_admin'\)/);
  assert.doesNotMatch(normalizedSql, /\('auditoria', 'incident_change_status'\)/);
  assert.match(normalizedSql, /\('gerencia', 'incident_admin'\)/);
  assert.match(normalizedSql, /kora_incident_has_permission\('incident_close'\)/);
  assert.match(normalizedSql, /kora_incident_has_permission\('incident_comment'\)/);
  assert.match(normalizedSql, /public\.kora_incident_can_view\(i\)/);
});

test('la vista existente pasa a solo lectura cuando no hay incident_admin', () => {
  assert.match(app, /state\.canAdmin\s*=\s*Boolean\(data\)/);
  assert.match(app, /managementPanel\.hidden\s*=\s*!state\.canAdmin/);
  assert.doesNotMatch(app, /throw new Error\('No tienes permiso para administrar incidencias\.'/);
  assert.match(app, /if \(state\.canAdmin\) await loadAssignees\(\)/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const app = await readFile('creditek/erp/incidencias-app.js', 'utf8');
const managementSource = await readFile('creditek/erp/kora-incident-management.js', 'utf8');
const domainSource = await readFile('creditek/erp/kora-incident-domain.js', 'utf8');
const migration = await readFile('creditek/erp/migrations/20260805_kora_incident_oscar_close.sql', 'utf8').catch(() => '');

function load(source, name) {
  const context = { window: {} };
  vm.runInNewContext(source, context);
  return context.window[name];
}

test('Óscar recibe todos los estados operativos en el selector', () => {
  assert.match(app, /const MANAGER_STATES = \[[^\]]*'en_desarrollo'[^\]]*'pendiente_validacion'[^\]]*'corregido'[^\]]*'cerrado'[^\]]*'reabierto'/s);
  assert.match(app, /MANAGER_STATES\.forEach/);
  assert.doesNotMatch(app, /STATES\.filter\(value => window\.KoraIncidentDomain\.canTransition/);
});

test('los estados usan las etiquetas aprobadas sin confundir validación con resuelta', () => {
  const management = load(managementSource, 'KoraIncidentManagement');
  assert.equal(management.statusLabel('en_desarrollo'), 'En atención');
  assert.equal(management.statusLabel('pendiente_validacion'), 'Pendiente de validación');
  assert.equal(management.statusLabel('corregido'), 'Resuelta');
  assert.equal(management.statusLabel('cerrado'), 'Cerrada');
  assert.equal(management.statusLabel('reabierto'), 'Reabierta');
});

test('resolver o cerrar exige resolución, versión y responsable', () => {
  const management = load(managementSource, 'KoraIncidentManagement');
  for (const status of ['corregido', 'cerrado']) {
    const invalid = management.validateManagement({ status });
    assert.deepEqual(Object.keys(invalid.errors).sort(), ['assignee', 'fixedVersion', 'resolution']);
    assert.equal(management.validateManagement({ status, resolution: 'Corregido', fixedVersion: '2.0.1', assignee: 'user-id' }).ok, true);
  }
});

test('Maite puede comentar pero no administrar, cerrar ni reabrir', () => {
  const domain = load(domainSource, 'KoraIncidentDomain');
  assert.equal(domain.hasIncidentPermission('auditoria', 'incident_comment'), true);
  for (const permission of ['incident_admin', 'incident_change_status', 'incident_close']) {
    assert.equal(domain.hasIncidentPermission('auditoria', permission), false);
  }
});

test('la RPC restringe administración a Gerencia y soporta cierre y reapertura auditados', () => {
  assert.match(migration, /kora_incident_has_permission\('incident_admin'\)/i);
  assert.match(migration, /kora_incident_has_permission\('incident_close'\)/i);
  assert.match(migration, /'reabierto'/i);
  assert.match(migration, /v_status in \('corregido', 'cerrado'\)[\s\S]*v_resolution[\s\S]*v_fixed_version[\s\S]*p_assigned_to/i);
  assert.match(migration, /status_changed|kora_incident_history/i);
  assert.match(migration, /kora_incident_notifications|notification/i);
  assert.doesNotMatch(migration, /grant execute[\s\S]*\bto anon\b/i);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = relative => readFile(new URL(relative, root), 'utf8');

const hub = await read('creditek/agentes/index.html');
const worker = await read('creditek/workers/aura-hub/src/index.js');
const migration = await read('creditek/erp/migrations/20260809_kora_aura_incident_bridge.sql');

test('AURA renderiza una sola arañita global fuera de los iframes', () => {
  assert.equal((hub.match(/data-aura-global-incident/g) || []).length, 1);
  assert.match(hub, /data-aura-global-incident[^>]*aria-label="Reportar incidencia"/);
  assert.match(hub, /data-lucide="bug"/);
  assert.match(hub, /onclick="openIncidentReporter\(\)"/);
  assert.doesNotMatch(hub, /<iframe[^>]*data-aura-global-incident/);
});

test('el formulario global captura título, descripción, evidencia y contexto seguro', () => {
  assert.match(hub, /id="incident-title"[^>]*maxlength="160"/);
  assert.match(hub, /id="incident-error"/);
  assert.match(hub, /id="incident-evidence"[^>]*type="file"/);
  assert.match(hub, /id="incident-submit"[^>]*onclick="submitCorporateIncident\(\)"/);
  assert.match(hub, /auraAuth\.token\(\)/);
  assert.match(hub, /local_incident_id/);
  assert.match(hub, /Incidencia registrada:/);
  assert.doesNotMatch(hub, /document\.cookie|localStorage\.getItem\([^)]*(?:token|secret|password)/i);
});

test('AURA Hub enruta el reporte al adaptador KORA y no a una base paralela', () => {
  assert.match(worker, /createCorporateIncident/);
  assert.match(worker, /\/creditek\/agentes\/api\/incidents/);
  assert.doesNotMatch(worker, /create table|aura_incidents|AURA_INCIDENT/);
});

test('el puente reutiliza el centro KORA con idempotencia y evidencia privada', () => {
  assert.match(migration, /public\.kora_incidents/);
  assert.match(migration, /public\.kora_incident_history/);
  assert.match(migration, /public\.kora_incident_notifications/);
  assert.match(migration, /local_incident_id/);
  assert.match(migration, /kora_next_incident_code\(\)/);
  assert.doesNotMatch(migration, /create table/i);
  assert.doesNotMatch(migration, /aura_incidents/i);
});


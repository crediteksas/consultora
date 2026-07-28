import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => readFile(path.join(root, relative), 'utf8');

function loadManagement(source) {
  const context = { window: {}, globalThis: {} };
  vm.runInNewContext(source, context);
  return context.window.KoraIncidentManagement;
}

test('Resuelto exige resolución y versión, pero En revisión no', async () => {
  const domain = loadManagement(await read('creditek/erp/kora-incident-management.js'));
  assert.equal(domain.validateManagement({ status: 'en_revision' }).ok, true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(domain.validateManagement({ status: 'corregido' }).errors)),
    {
      resolution: 'Escribe la resolución aplicada.',
      fixedVersion: 'Indica la versión corregida.',
    },
  );
  assert.equal(domain.validateManagement({
    status: 'corregido',
    resolution: 'Se corrigió la capa del modal.',
    fixedVersion: '2.0.1',
  }).ok, true);
  assert.equal(domain.statusLabel('corregido'), 'Resuelto');
});

test('nunca usa un UUID como nombre visible', async () => {
  const domain = loadManagement(await read('creditek/erp/kora-incident-management.js'));
  assert.equal(domain.displayName({ nombre: 'Oscar Javier Pacheco' }), 'Oscar Javier Pacheco');
  assert.equal(domain.displayName({ email: 'soporte@example.test' }), 'soporte@example.test');
  assert.equal(domain.displayName({ id: '6de0ad26-64af-4966-8cd9-d468880af627' }), 'Usuario sin nombre');
  assert.equal(domain.displayName('6de0ad26-64af-4966-8cd9-d468880af627'), 'Usuario sin nombre');
});

test('el historial traduce eventos técnicos a lenguaje humano', async () => {
  const domain = loadManagement(await read('creditek/erp/kora-incident-management.js'));
  const people = new Map([['oscar-id', { nombre: 'Oscar Javier Pacheco' }]]);
  assert.match(domain.historyText({ event_type: 'created', responsible_user_id: 'oscar-id' }, people), /Incidencia creada por Oscar Javier Pacheco/);
  assert.equal(domain.historyText({ event_type: 'evidence_added' }, people), 'Evidencia adjuntada.');
  assert.match(domain.historyText({
    event_type: 'status_changed',
    new_value: { status: 'corregido', fixed_version: '2.0.1' },
  }, people), /Incidencia resuelta en la versión 2\.0\.1/);
});

test('la migración v1.1 crea notificaciones privadas, cierre idempotente y rollback', async () => {
  const [sql, rollback] = await Promise.all([
    read('creditek/erp/migrations/20260728_kora_incident_center_v1_1.sql'),
    read('creditek/erp/migrations/rollback/20260728_kora_incident_center_v1_1.rollback.sql'),
  ]);
  assert.match(sql, /create table if not exists public\.kora_notifications/i);
  assert.match(sql, /user_id uuid not null/i);
  assert.match(sql, /read_at timestamptz/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /user_id = auth\.uid\(\)/i);
  assert.match(sql, /create or replace function public\.kora_manage_incident_v1_1/i);
  assert.match(sql, /p_request_id uuid/i);
  assert.match(sql, /on conflict \(request_id\) do nothing/i);
  assert.match(sql, /v_status = 'corregido'[\s\S]*resoluci[oó]n/i);
  assert.match(sql, /resolved_at/i);
  assert.match(sql, /deduplication_key/i);
  assert.match(sql, /on conflict \(deduplication_key\) do nothing/i);
  assert.match(sql, /create policy[\s\S]*kora_notifications[\s\S]*auth\.uid\(\)/i);
  assert.match(rollback, /drop function if exists public\.kora_manage_incident_v1_1/i);
  assert.match(rollback, /drop table if exists public\.kora_notifications/i);
});

test('la interfaz usa el cierre v1.1, feedback, nombres y formulario responsive', async () => {
  const [app, admin, css] = await Promise.all([
    read('creditek/erp/incidencias-app.js'),
    read('creditek/erp/incidencias.html'),
    read('design-system/components/kora-incident-center.css'),
  ]);
  assert.match(app, /kora_manage_incident_v1_1/);
  assert.match(app, /Incidencia resuelta correctamente/);
  assert.match(app, /crypto\.randomUUID\(\)/);
  assert.doesNotMatch(app, /item\.assigned_to \|\| 'Sin asignar'/);
  assert.match(admin, /data-detail-management/);
  assert.match(admin, /data-detail-field-error="resolution"/);
  assert.match(admin, /data-detail-field-error="fixedVersion"/);
  assert.match(css, /\.kora-incident-management/);
  assert.match(css, /@media\(max-width:720px\)[\s\S]*kora-incident-management/s);
});

test('el shell monta campana, contador y panel de notificaciones', async () => {
  const [sidebar, notifications, css] = await Promise.all([
    read('creditek/erp/sidebar.js'),
    read('creditek/erp/kora-notifications.js'),
    read('design-system/components/kora-incident-center.css'),
  ]);
  assert.match(sidebar, /KoraNotifications\?\.mount/);
  assert.doesNotMatch(sidebar, /data-kora-notifications[^>]*disabled/);
  assert.match(notifications, /kora_notifications/);
  assert.match(notifications, /data-kora-notification-count/);
  assert.match(notifications, /Marcar todas como leídas/);
  assert.match(notifications, /read_at/);
  assert.match(notifications, /mis-reportes\.html\?id=/);
  assert.match(sidebar, /KoraNotifications\?\.mount/);
  assert.match(notifications, /kora-notifications-refresh/);
  assert.match(await read('creditek/erp/incidencias-app.js'), /kora-notifications-refresh/);
  assert.match(css, /\.kora-notifications-panel/);
  assert.match(css, /\.kora-notifications-panel \.kora-notification-item/);
  assert.match(css, /kora-notification-item\{[^}]*color:var\(--ctk-color-text-primary/);
});

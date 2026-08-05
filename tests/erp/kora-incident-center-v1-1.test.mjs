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
      assignee: 'Asigna un responsable antes de resolver o cerrar.',
    },
  );
  assert.equal(domain.validateManagement({
    status: 'corregido',
    resolution: 'Se corrigió la capa del modal.',
    fixedVersion: '2.0.1',
    assignee: 'responsable-id',
  }).ok, true);
  assert.equal(domain.validateManagement({ status: 'cerrado' }).ok, false);
  assert.equal(domain.validateManagement({
    status: 'cerrado',
    resolution: 'Corrección validada por Gerencia.',
    fixedVersion: '2.0.1',
    assignee: 'responsable-id',
  }).ok, true);
  assert.equal(domain.statusLabel('corregido'), 'Resuelta');
});

test('ordena por estado y fecha, y pagina sin duplicar registros', async () => {
  const domain = loadManagement(await read('creditek/erp/kora-incident-management.js'));
  const records = Array.from({ length: 45 }, (_, index) => ({
    id: `inc-${index}`,
    status: index % 5 === 0 ? 'cerrado' : index % 3 === 0 ? 'pendiente_validacion' : 'nuevo',
    created_at: new Date(Date.UTC(2026, 7, 1, 0, index)).toISOString(),
  }));

  const sorted = domain.sortIncidents(records);
  assert.deepEqual(
    JSON.parse(JSON.stringify(sorted.slice(0, 3).map(item => item.id))),
    ['inc-44', 'inc-43', 'inc-41'],
  );
  const first = domain.paginateIncidents(sorted, 1, 20);
  const second = domain.paginateIncidents(sorted, 2, 20);
  const third = domain.paginateIncidents(sorted, 3, 20);

  assert.equal(first.totalPages, 3);
  assert.equal(first.items.length, 20);
  assert.equal(second.items.length, 20);
  assert.equal(third.items.length, 5);
  assert.equal(new Set([...first.items, ...second.items, ...third.items].map(item => item.id)).size, 45);
  assert.equal(first.items.some(item => second.items.includes(item)), false);
});

test('clasifica discretamente incidencias gestionadas y pendientes', async () => {
  const domain = loadManagement(await read('creditek/erp/kora-incident-management.js'));

  for (const status of ['corregido', 'cerrado', 'rechazado', 'no_reproducible', 'duplicado']) {
    assert.equal(domain.statusTone(status), 'managed');
  }
  for (const status of ['nuevo', 'en_revision', 'confirmado', 'en_desarrollo', 'pendiente_validacion']) {
    assert.equal(domain.statusTone(status), 'pending');
  }

  const [app, css] = await Promise.all([
    read('creditek/erp/incidencias-app.js'),
    read('design-system/components/kora-incident-center.css'),
  ]);
  assert.match(app, /kora-incident-status--\$\{tone\}/);
  assert.match(app, /row\.dataset\.managementState = tone/);
  assert.match(css, /\.kora-incident-status--managed/);
  assert.match(css, /\.kora-incident-status--pending/);
  assert.match(css, /data-management-state=managed/);
  assert.match(css, /data-management-state=pending/);
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
  assert.match(app, /PAGE_SIZE\s*=\s*20/);
  assert.match(app, /paginateIncidents/);
  assert.match(app, /Incidencia resuelta correctamente/);
  assert.match(app, /crypto\.randomUUID\(\)/);
  assert.doesNotMatch(app, /item\.assigned_to \|\| 'Sin asignar'/);
  assert.match(admin, /data-detail-management/);
  assert.match(admin, /data-detail-field-error="resolution"/);
  assert.match(admin, /data-detail-field-error="fixedVersion"/);
  assert.match(css, /\.kora-incident-management/);
  assert.match(css, /@media\(max-width:720px\)[\s\S]*kora-incident-management/s);
});

test('la migración de cierre unifica transición, permisos y fecha de cierre', async () => {
  const sql = await read('creditek/erp/migrations/20260801_kora_incident_close_transition.sql');
  assert.match(sql, /kora_incident_has_permission\('incident_admin'\)/i);
  assert.match(sql, /kora_incident_has_permission\('incident_close'\)/i);
  assert.match(sql, /v_incident\.status = 'corregido'[\s\S]*v_status in \('pendiente_validacion', 'cerrado', 'en_desarrollo'\)/i);
  assert.match(sql, /closed_at = case[\s\S]*v_status = 'cerrado'[\s\S]*now\(\)/i);
  assert.match(sql, /resolution_summary/i);
  assert.doesNotMatch(sql, /Para cerrar[^']*versión corregida/i);
  assert.match(sql, /assigned_to/i);
  assert.match(sql, /revoke all on function public\.kora_manage_incident_v1_1/i);
  assert.match(sql, /grant execute on function public\.kora_manage_incident_v1_1[\s\S]*to authenticated/i);
});

test('el shell monta campana, contador y panel de notificaciones', async () => {
  const [sidebar, notifications, css] = await Promise.all([
    read('creditek/erp/sidebar.js'),
    read('creditek/erp/kora-notifications.js'),
    read('design-system/components/kora-incident-center.css'),
  ]);
  assert.match(sidebar, /KoraNotifications\?\.mount/);
  assert.match(sidebar, /kora-incident-center\.css\?v=1\.1\.1/);
  assert.match(sidebar, /kora-notifications\.js\?v=1\.1\.2/);
  assert.doesNotMatch(sidebar, /data-kora-notifications[^>]*disabled/);
  assert.match(notifications, /kora_notifications/);
  assert.match(notifications, /data-kora-notification-count/);
  assert.match(notifications, /Marcar todas como leídas/);
  assert.match(notifications, /read_at/);
  assert.match(notifications, /incidencias\.html\?id=/);
  assert.match(sidebar, /KoraNotifications\?\.mount/);
  assert.match(notifications, /kora-notifications-refresh/);
  assert.match(notifications, /kora-notification-item ghost/);
  assert.match(await read('creditek/erp/incidencias-app.js'), /kora-notifications-refresh/);
  assert.match(css, /\.kora-notifications-panel/);
  assert.match(css, /\.kora-notifications-panel \.kora-notification-item/);
  assert.match(css, /kora-notification-item\{[^}]*background:var\(--ctk-color-neutral-0/);
  assert.match(css, /kora-notification-item\{[^}]*color:var\(--ctk-color-primary-900/);
});

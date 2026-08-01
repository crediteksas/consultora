import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);

function loadDomain() {
  try {
    return require(path.join(root, 'creditek/erp/kora-incident-domain.js'));
  } catch {
    return null;
  }
}

const validIncident = {
  title: 'No permite guardar la venta',
  description: 'Al confirmar la venta aparece un error visible.',
  attemptedAction: 'Registrar una venta financiada.',
  additionalInformation: 'Ocurrió después de seleccionar la tienda.',
  priority: 'alta',
};

test('valida el formulario y limita texto, prioridad y archivos inseguros', () => {
  const domain = loadDomain();
  assert.ok(domain, 'falta el dominio compartido de incidencias');

  assert.deepEqual(domain.validateIncidentInput(validIncident), {
    ok: true,
    value: validIncident,
  });
  assert.equal(domain.validateIncidentInput({ ...validIncident, title: '  ' }).ok, false);
  assert.equal(domain.validateIncidentInput({ ...validIncident, priority: 'urgente' }).ok, false);
  assert.equal(domain.validateIncidentInput({ ...validIncident, description: 'a'.repeat(5001) }).ok, false);

  assert.equal(domain.validateEvidence({
    name: 'captura.webp',
    type: 'image/webp',
    size: 2_000_000,
  }).ok, true);
  assert.equal(domain.validateEvidence({
    name: 'reporte.pdf',
    type: 'application/pdf',
    size: 4_000_000,
  }).ok, true);
  assert.equal(domain.validateEvidence({
    name: 'ataque.exe',
    type: 'application/octet-stream',
    size: 10,
  }).ok, false);
  assert.equal(domain.validateEvidence({
    name: 'enorme.png',
    type: 'image/png',
    size: 11_000_000,
  }).ok, false);
});

test('redacta secretos, credenciales, cookies y datos bancarios antes de registrar contexto', () => {
  const domain = loadDomain();
  assert.ok(domain, 'falta el dominio compartido de incidencias');

  const source = [
    'Authorization: Bearer abc.def.ghi',
    'access_token=super-secreto',
    'password=MiClave123',
    'cookie=session-real',
    'tarjeta 4111 1111 1111 1111',
  ].join('\n');
  const redacted = domain.redactSensitive(source);

  assert.doesNotMatch(redacted, /abc\.def\.ghi|super-secreto|MiClave123|session-real|4111 1111 1111 1111/);
  assert.match(redacted, /\[REDACTADO\]/);
});

test('detecta reportes abiertos similares sin bloquear un reporte legítimo', () => {
  const domain = loadDomain();
  assert.ok(domain, 'falta el dominio compartido de incidencias');

  const incidents = [
    {
      id: '1',
      incident_code: 'KORA-2026-000001',
      title: 'No permite guardar venta financiada',
      module: 'Ventas',
      page_name: 'Ventas',
      store_code: 'CK-01',
      kora_version: '2.0.1',
      status: 'nuevo',
    },
    {
      id: '2',
      incident_code: 'KORA-2026-000002',
      title: 'Error diferente en inventario',
      module: 'Inventario',
      page_name: 'Stock',
      store_code: 'CK-02',
      kora_version: '2.0.1',
      status: 'cerrado',
    },
  ];

  const matches = domain.findSimilarIncidents({
    title: 'No puedo guardar una venta financiada',
    module: 'Ventas',
    pageName: 'Ventas',
    storeCode: 'CK-01',
    koraVersion: '2.0.1',
  }, incidents);

  assert.deepEqual(matches.map(item => item.incident_code), ['KORA-2026-000001']);
});

test('genera una tarea técnica editable sin secretos ni URLs firmadas', () => {
  const domain = loadDomain();
  assert.ok(domain, 'falta el dominio compartido de incidencias');

  const task = domain.generateTechnicalTask({
    incident_code: 'KORA-2026-000042',
    kora_version: '2.0.1',
    module: 'Caja',
    page_name: 'Cierre diario',
    priority: 'critica',
    store_name_snapshot: 'Tienda sintética',
    role_snapshot: 'admin_tienda',
    description: 'Authorization: Bearer secreto',
    attempted_action: 'Cerrar caja',
    evidence_path: 'incidente/archivo.png?token=firma-temporal',
    technical_context: { browser: 'Chrome', errors: ['password=secreto'] },
  });

  assert.match(task, /^INCIDENCIA KORA-2026-000042/m);
  assert.match(task, /^Pruebas requeridas:/m);
  assert.doesNotMatch(task, /Bearer secreto|firma-temporal|password=secreto/);
  assert.match(task, /\[REDACTADO\]/);
});

test('la cola offline conserva el identificador local y sincroniza sin duplicados', async () => {
  const domain = loadDomain();
  assert.ok(domain, 'falta el dominio compartido de incidencias');

  const records = new Map();
  const adapter = {
    async put(record) { records.set(record.localId, structuredClone(record)); },
    async list() { return [...records.values()].map(record => structuredClone(record)); },
    async remove(localId) { records.delete(localId); },
  };
  const queue = new domain.IncidentOfflineQueue(adapter);
  const pending = { localId: '11111111-1111-4111-8111-111111111111', payload: validIncident };

  await queue.enqueue(pending);
  await queue.enqueue(pending);
  assert.equal((await queue.pending()).length, 1);

  const synchronized = [];
  const result = await queue.sync(async record => {
    synchronized.push(record.localId);
    return { ok: true, incidentCode: 'KORA-2026-000010' };
  });

  assert.deepEqual(synchronized, [pending.localId]);
  assert.deepEqual(result, [{
    localId: pending.localId,
    ok: true,
    incidentCode: 'KORA-2026-000010',
  }]);
  assert.equal((await queue.pending()).length, 0);
});

test('aplica el flujo oficial y reserva cambios administrativos a permisos explícitos', () => {
  const domain = loadDomain();
  assert.ok(domain, 'falta el dominio compartido de incidencias');

  assert.equal(domain.canTransition('nuevo', 'en_revision'), true);
  assert.equal(domain.canTransition('en_revision', 'confirmado'), true);
  assert.equal(domain.canTransition('pendiente_validacion', 'cerrado'), true);
  assert.equal(domain.canTransition('corregido', 'cerrado'), true);
  assert.equal(domain.canTransition('cerrado', 'en_desarrollo'), false);
  assert.equal(domain.hasIncidentPermission('asesor', 'incident_assign'), false);
  assert.equal(domain.hasIncidentPermission('admin_tienda', 'incident_view_store'), true);
  assert.equal(domain.hasIncidentPermission('gerencia', 'incident_generate_task'), true);
});

test('la migración crea consecutivo atómico, RLS, historial, comentarios y bucket privado', async () => {
  const migrationPath = path.join(
    root,
    'creditek/erp/migrations/20260727_kora_incident_center_v1.sql',
  );
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /create table if not exists public\.kora_incidents/i);
  assert.match(sql, /create table if not exists public\.kora_incident_history/i);
  assert.match(sql, /create table if not exists public\.kora_incident_comments/i);
  assert.match(sql, /create or replace function public\.kora_attach_incident_comment_evidence/i);
  assert.match(sql, /create table if not exists public\.kora_incident_permissions/i);
  assert.match(sql, /create table if not exists public\.kora_incident_notifications/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /KORA-%s-%s/i);
  assert.match(sql, /local_incident_id[\s\S]*unique/i);
  assert.match(sql, /enable row level security/gi);
  assert.match(sql, /incident_view_own/);
  assert.match(sql, /incident_view_store/);
  assert.match(sql, /incident_view_all/);
  assert.match(sql, /insert into storage\.buckets[\s\S]*kora-incident-evidence[\s\S]*false/i);
  assert.match(sql, /create policy[\s\S]*storage\.objects/gi);
  assert.match(sql, /revoke all[\s\S]*from public, anon/gi);
  assert.match(sql, /security definer/gi);
  assert.match(sql, /grant execute on function public\.kora_incident_can_view\(public\.kora_incidents\)[\s\S]*to authenticated/i);
  assert.match(sql, /raise exception 'Límite de reportes excedido[^']*'/i);
});

test('el rollback se niega a borrar incidencias existentes', async () => {
  const sql = await readFile(
    path.join(root, 'creditek/erp/migrations/rollback/20260727_kora_incident_center_v1.rollback.sql'),
    'utf8',
  );

  assert.match(sql, /exists\s*\(select 1 from public\.kora_incidents\)/i);
  assert.match(sql, /raise exception[\s\S]*respaldo/i);
});

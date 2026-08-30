import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

test('el shell usa la arañita y presenta navegación de incidencias por rol', async () => {
  const [sidebar, center] = await Promise.all([
    readFile(path.join(root, 'creditek/erp/sidebar.js'), 'utf8'),
    readFile(path.join(root, 'creditek/erp/kora-incident-center.js'), 'utf8'),
  ]);

  assert.match(sidebar, /label:\s*'Centro de Incidencias'[\s\S]*roles:\s*\['gerencia'/);
  assert.match(sidebar, /label:\s*'Mis incidencias'[\s\S]*roles:\s*\['admin_tienda'/);
  assert.match(sidebar, /KoraIncidentCenter\?\.mount/);
  assert.match(center, /data-kora-report-incident/);
  assert.match(center, /aria-label="Reportar incidencia"/);
  assert.match(center, /data-lucide="bug"/);
  assert.match(center, /KoraAudio\?\.play/);
});

test('el Centro de Incidencias concentra consulta, detalle y seguimiento', async () => {
  const admin = await readFile(path.join(root, 'creditek/erp/incidencias.html'), 'utf8');

  assert.match(admin, /sidebar\.js\?v=2\.0\.15" data-kora-shell="1\.0\.0"/);
  assert.match(admin, /data-kora-requires-auth="true"/);
  assert.match(admin, /kora-incident-management\.js\?v=1\.2\.4/);
  assert.match(admin, /Nuevas[\s\S]*Críticas[\s\S]*En desarrollo[\s\S]*Pendientes de validación/);
  assert.match(admin, /data-incident-filter="status"/);
  assert.match(admin, /data-incident-filter="store"[\s\S]*data-incident-filter="user"[\s\S]*data-incident-filter="assignee"[\s\S]*data-incident-filter="version"/);
  assert.match(admin, /data-incident-history/);
  assert.match(admin, /Generar tarea técnica/);
  assert.match(admin, /data-incident-add-comment/);
  assert.match(admin, /data-comment-evidence/);
  assert.match(admin, /data-incident-pagination/);
  assert.match(admin, /data-incident-previous/);
  assert.match(admin, /data-incident-next/);
  assert.match(admin, /data-incident-page/);
});

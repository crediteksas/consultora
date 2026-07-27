import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

test('el shell monta un único botón global y agrega Administración y Mis reportes', async () => {
  const [sidebar, center] = await Promise.all([
    readFile(path.join(root, 'creditek/erp/sidebar.js'), 'utf8'),
    readFile(path.join(root, 'creditek/erp/kora-incident-center.js'), 'utf8'),
  ]);

  assert.match(sidebar, /label:\s*'Incidencias'[\s\S]*roles:\s*\['gerencia',\s*'auditoria'/);
  assert.match(sidebar, /label:\s*'Mis reportes'/);
  assert.match(sidebar, /KoraIncidentCenter\?\.mount/);
  assert.match(center, /data-kora-report-incident/);
  assert.match(center, /aria-label="Reportar error"/);
  assert.match(center, /data-lucide="bug"/);
  assert.match(center, /KoraAudio\?\.play/);
});

test('las vistas de incidencias usan el shell, filtros, KPIs, detalle e historial', async () => {
  const [admin, own] = await Promise.all([
    readFile(path.join(root, 'creditek/erp/incidencias.html'), 'utf8'),
    readFile(path.join(root, 'creditek/erp/mis-reportes.html'), 'utf8'),
  ]);

  assert.match(admin, /sidebar\.js" data-kora-shell="1\.0\.0"/);
  assert.match(admin, /Nuevas[\s\S]*Críticas[\s\S]*En desarrollo[\s\S]*Pendientes de validación/);
  assert.match(admin, /data-incident-filter="status"/);
  assert.match(admin, /data-incident-history/);
  assert.match(admin, /Generar tarea técnica/);
  assert.match(own, /sidebar\.js" data-kora-shell="1\.0\.0"/);
  assert.match(own, /Mis reportes/);
  assert.match(own, /data-incident-add-comment/);
  assert.match(own, /data-incident-confirm-fixed/);
});

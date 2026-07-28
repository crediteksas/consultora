import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

test('el modal técnico es amplio, accesible y organiza toda la información', async () => {
  const [html, css] = await Promise.all([
    readFile(path.join(root, 'creditek/erp/incidencias.html'), 'utf8'),
    readFile(path.join(root, 'design-system/components/kora-incident-center.css'), 'utf8'),
  ]);

  assert.match(html, /data-task-dialog[^>]*aria-labelledby="incidentTaskTitle"/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /incidencias-app\.js\?v=1\.1\.1/);
  for (const section of [
    'Información de la incidencia',
    'Descripción del problema',
    'Acción intentada',
    'Pasos conocidos para reproducir',
    'Resultado actual',
    'Resultado esperado',
    'Datos técnicos',
    'Historial',
    'Restricciones',
    'No modificar',
    'Pruebas requeridas',
  ]) assert.match(html, new RegExp(section));
  assert.doesNotMatch(html, /kora-incident-task"[^>]*textarea|<textarea[^>]*data-task/);
  assert.match(css, /\.kora-incident-task-dialog\{[^}]*width:min\(85vw/);
  assert.match(css, /height:min\(85dvh/);
  assert.match(css, /\.kora-incident-task-dialog__body\{[^}]*overflow-y:auto/);
  assert.match(css, /@media\(max-width:720px\)[\s\S]*\.kora-incident-task-dialog/);
});

test('el controlador conserva el generador, copia el texto completo y gestiona foco y cierres', async () => {
  const app = await readFile(path.join(root, 'creditek/erp/incidencias-app.js'), 'utf8');

  assert.match(app, /KoraIncidentDomain\.generateTechnicalTask/);
  assert.match(app, /navigator\.clipboard\.writeText\(state\.taskText\)/);
  assert.match(app, /fact\.append\(el\('dt', term\), el\('dd', displayValue\(value\)\)\)/);
  assert.match(app, /Tarea técnica copiada/);
  assert.match(app, /event\.key !== 'Tab'/);
  assert.match(app, /event\.target === taskModal/);
  assert.match(app, /taskModal\?\.addEventListener\('cancel'/);
  assert.match(app, /taskActivator\?\.focus/);
  assert.match(app, /copyingTask/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile('creditek/erp/incidencias.html', 'utf8');
const app = await readFile('creditek/erp/incidencias-app.js', 'utf8');

test('todo detalle ofrece Volver al listado con semántica accesible', () => {
  assert.match(html, /data-incident-back[^>]*>← Volver al listado</);
  assert.match(html, /aria-label="Volver al listado de incidencias"/);
});

test('volver oculta el detalle sin recargar ni reconstruir el listado', () => {
  assert.match(app, /function closeDetail\(\)/);
  assert.match(app, /detail\.hidden = true/);
  assert.match(app, /state\.selected = null/);
  assert.match(app, /data-incident-back[^\n]*addEventListener\('click', closeDetail\)/);
  const closeBody = app.slice(app.indexOf('function closeDetail()'), app.indexOf('async function loadAssignees'));
  assert.doesNotMatch(closeBody, /location\.(assign|reload)|renderList\(|loadIncidents\(/);
});

test('volver conserva contexto, restaura foco y elimina solo el id de detalle', () => {
  assert.match(app, /state\.listScrollY = scrollY/);
  assert.match(app, /state\.detailActivator/);
  assert.match(app, /scrollTo\(\{ top: state\.listScrollY/);
  assert.match(app, /url\.searchParams\.delete\('id'\)/);
  assert.match(app, /history\.replaceState\(history\.state, '', url\)/);
  assert.doesNotMatch(app, /sessionStorage\.clear|localStorage\.clear/);
});

test('abrir desde cualquier estado usa la misma navegación de regreso', () => {
  assert.match(app, /openDetail\(item, codeButton\)/);
  assert.match(app, /if \(activator\) state\.detailActivator = activator/);
  assert.match(html, /incidencias-app\.js\?v=1\.3\.4/);
});

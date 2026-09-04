import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile('creditek/erp/aliados-v1-1-app.js', 'utf8');
const css = await readFile('creditek/erp/aliados-v1-1.css', 'utf8');
const html = await readFile('creditek/erp/aliados-plataformas.html', 'utf8');

test('Plataformas presenta un tablero operativo por plataforma', () => {
  assert.match(app, /function renderPlatformCards/);
  assert.match(app, /Participación/);
  assert.match(app, /Ticket promedio/);
  assert.match(app, /Pagos por gestionar/);
  assert.match(app, /Detalle por establecimiento/);
  assert.match(app, /platforms:renderPlatformCards/);
  assert.match(css, /\.platform-grid\{display:grid/);
  assert.match(css, /\.badge\.con_novedad/);
  assert.match(css, /body\[data-aliados-view="platforms"\] \.metrics\{grid-template-columns:repeat\(5/);
  assert.match(css, /body\[data-aliados-view="platforms"\] \.metric strong\{font-size:17px;white-space:nowrap/);
  assert.match(html, /aliados-v1-1\.css\?v=1\.1\.27/);
  assert.match(html, /aliados-v1-1-app\.js\?v=1\.1\.26/);
});

test('Plataformas separa utilidad, presupuesto e histórico', () => {
  const renderer = app.slice(app.indexOf('function renderPlatformCards'), app.indexOf('function renderPlatformGoals'));
  assert.match(renderer, /Consultar base histórica/);
  assert.match(renderer, /La utilidad se analiza en Reportes Aliados y las metas en Presupuesto/);
  assert.doesNotMatch(renderer, /Utilidad disponible nueva/);
  assert.doesNotMatch(renderer, /Resultado generado \(ya retirado\)/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile('creditek/erp/aliados-v1-1-app.js', 'utf8');
const css = await readFile('creditek/erp/aliados-v1-1.css', 'utf8');
const html = await readFile('creditek/erp/aliados-ejecutivos.html', 'utf8');

test('Ejecutivos usa una tarjeta por persona con desglose real por plataforma', () => {
  assert.match(app, /function renderExecutiveCards/);
  assert.match(app, /Ventas por plataforma/);
  assert.match(app, /platformName\(p\.id\)/);
  assert.match(app, /p\.count.*crédito/);
  assert.match(app, /cop\(p\.sales\)/);
  assert.match(app, /executives:\s*renderExecutiveCards/);
  assert.match(css, /\.executive-grid\{display:grid/);
  assert.match(css, /\.executive-card\{border-top:3px solid var\(--turquesa\)/);
  assert.match(html, /aliados-v1-1-app\.js\?v=1\.1\.24/);
});

test('tiendas propias se identifican aparte de aliados sin ejecutivo', () => {
  assert.match(app, /ownStoreOps = periodOps.filter\(\(o\) => o.tipo_establecimiento === "propia"/);
  assert.match(app, /unassignedOps = periodOps.filter\(\(o\) => o.tipo_establecimiento !== "propia"/);
  assert.match(app, /Tiendas propias · Retail/);
});

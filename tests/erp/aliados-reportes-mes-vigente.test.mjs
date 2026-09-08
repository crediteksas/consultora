import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile('creditek/erp/aliados-v1-1-app.js', 'utf8');
const html = await readFile('creditek/erp/aliados-reportes.html', 'utf8');
const css = await readFile('creditek/erp/aliados-v1-1.css', 'utf8');
const render = app.slice(app.indexOf('function renderReports()'), app.indexOf('function render(){'));

test('Reportes Aliados abre con el acumulado del mes vigente', () => {
  assert.match(render, /reportFrom/);
  assert.match(render, /reportTo/);
  assert.match(render, /bogotaDateParts/);
  assert.match(render, /monthStart/);
  assert.match(render, /Mes vigente/);
});

test('Reportes comparte fuente, filtros y cálculo del dashboard', () => {
  assert.match(render, /renderDashboard\(\{report:true,from,to,platform,executive,paymentState/);
  assert.match(render, /reportBusiness/);
  assert.doesNotMatch(render, /operationIsCurrent\(o\)/);
  assert.doesNotMatch(render, /includedIds\.has\(b\.liquidation_id\)/);
});
test('histórico se incluye para consulta sin pagos nuevos', () => {
  assert.match(app, /dashboardOperations\(\)\.filter/);
  assert.match(app, /Incluye históricos sin duplicar créditos ni generar pagos/);
  assert.match(html, /aliados-v1-1-app\.js\?v=1\.1\.32/);
});
test('utilidad bruta y final se distinguen sin margen Retail', () => {
  assert.match(app, /Utilidad bruta del negocio/);
  assert.match(app, /Utilidad final del periodo/);
  assert.match(app, /Margen de la liquidación, no ganancia del inventario Retail/);
});

test('los indicadores del informe forman una cuadrícula alineada y adaptable', () => {
  assert.match(css, /body\[data-aliados-view="reports"\] \.metrics\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /body\[data-aliados-view="reports"\] \.metric\{display:flex;min-width:0;min-height:112px;flex-direction:column/);
  assert.match(css, /font-variant-numeric:tabular-nums/);
  assert.match(css, /@media\(max-width:900px\).*repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:520px\).*grid-template-columns:1fr/);
});

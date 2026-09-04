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

test('tarjetas y tabla usan la fecha real de venta y los filtros visibles', () => {
  assert.match(render, /operationSaleDay/);
  assert.match(render, /operationIsCurrent/);
  assert.match(render, /reportPlatform/);
  assert.match(render, /reportExecutive/);
  assert.match(render, /reportPaymentState/);
  assert.match(render, /Periodo de ventas visible/);
  assert.match(render, /exclusivamente al periodo seleccionado/);
});

test('el informe operativo no suma el histórico cerrado', () => {
  assert.doesNotMatch(render, /historicalUtilityOriginal/);
  assert.doesNotMatch(render, /Resultado histórico/);
  assert.match(render, /El histórico cerrado se conserva en auditoría/);
  assert.match(html, /aliados-v1-1-app\.js\?v=1\.1\.19/);
});

test('el inicio operativo incluye todas las ventas desde el 1 de septiembre', () => {
  assert.match(app, /const OPERATION_CUTOFF='2026-09-01'/);
  assert.doesNotMatch(app, /const OPERATION_CUTOFF='2026-09-02'/);
});

test('la utilidad del negocio incluye operaciones originadas en tiendas propias y aliados', () => {
  assert.match(render, /ownOps=ops\.filter\(o=>businessType\(o\)==='propia'\)/);
  assert.match(render, /allyOps=ops\.filter\(o=>businessType\(o\)==='aliado'\)/);
  assert.match(render, /grossUtility=ownUtility\+allyUtility/);
  assert.match(render, /Utilidad originada en tiendas propias/);
  assert.match(render, /Utilidad originada en aliados/);
  assert.match(render, /Utilidad neta disponible/);
  assert.match(render, /Utilidad total del negocio/);
  assert.doesNotMatch(render, /const allyOps=db\.operations\.filter/);
});

test('los indicadores del informe forman una cuadrícula alineada y adaptable', () => {
  assert.match(css, /body\[data-aliados-view="reports"\] \.metrics\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /body\[data-aliados-view="reports"\] \.metric\{display:flex;min-width:0;min-height:112px;flex-direction:column/);
  assert.match(css, /font-variant-numeric:tabular-nums/);
  assert.match(css, /@media\(max-width:900px\).*repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:520px\).*grid-template-columns:1fr/);
});

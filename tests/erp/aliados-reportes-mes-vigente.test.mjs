import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile('creditek/erp/aliados-v1-1-app.js', 'utf8');
const html = await readFile('creditek/erp/aliados-reportes.html', 'utf8');
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
  assert.match(html, /aliados-v1-1-app\.js\?v=1\.1\.17/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile('creditek/erp/aliados-v1-1-app.js', 'utf8');
const html = await readFile('creditek/erp/aliados-bonificaciones.html', 'utf8');
const render = app.slice(app.indexOf('function renderBonuses()'), app.indexOf('function populateExpenseForm()'));

test('Bonificaciones abre en el mes vigente y filtra por fecha real de venta', () => {
  assert.match(render, /bonusFrom/);
  assert.match(render, /bonusTo/);
  assert.match(render, /bogotaDateParts/);
  assert.match(render, /operationSaleDay/);
  assert.match(render, /operationIsCurrent/);
  assert.match(render, /Mes vigente/);
});

test('permite filtrar bonificaciones por plataforma, ejecutivo y estado', () => {
  assert.match(render, /bonusPlatform/);
  assert.match(render, /bonusExecutive/);
  assert.match(render, /bonusState/);
  assert.match(render, /Aprobadas/);
  assert.match(render, /Pendientes/);
  assert.match(render, /Pagadas/);
});

test('la pantalla operativa no repite el histórico cerrado', () => {
  assert.match(render, /Bonificaciones del periodo/);
  assert.match(render, /Fecha de venta/);
  assert.doesNotMatch(render, /Histórico inicial — pagado/);
  assert.doesNotMatch(render, /<h2>Operación nueva<\/h2>/);
  assert.match(html, /aliados-v1-1-app\.js\?v=1\.1\.17/);
});

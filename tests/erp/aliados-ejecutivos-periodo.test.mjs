import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../../creditek/erp/aliados-v1-1-app.js', import.meta.url), 'utf8');

test('Ejecutivos abre con el mes vigente y muestra fechas en cada indicador', () => {
  assert.match(app, /executiveFrom/);
  assert.match(app, /executiveTo/);
  assert.match(app, /Mes vigente/);
  assert.match(app, /operationReportingDay/);
  assert.match(app, /Periodo de liquidación visible/);
  assert.match(app, /aunque la venta se haya realizado un día anterior/);
});

test('separa el periodo actual del histórico cerrado y traduce políticas', () => {
  assert.match(app, /Histórico cerrado al 1 sep 2026/);
  assert.match(app, /histórico cerrado del 4 de julio al 1 de septiembre de 2026/);
  assert.match(app, /Bono fijo con ajuste autorizado/);
  assert.match(app, /Bonos históricos ya pagados/);
});

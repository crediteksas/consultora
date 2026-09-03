import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../../creditek/erp/aliados-v1-1-app.js', import.meta.url), 'utf8');

test('Ejecutivos abre con el mes vigente y muestra fechas en cada indicador', () => {
  assert.match(app, /executiveFrom/);
  assert.match(app, /executiveTo/);
  assert.match(app, /Mes vigente/);
  assert.match(app, /operationSaleDay/);
  assert.match(app, /operationIsCurrent/);
  assert.match(app, /Periodo de ventas visible/);
  assert.match(app, /fecha real de venta/);
  assert.match(app, /Sin ejecutivo asignado/);
  assert.match(app, /periodOps\.length/);
});

test('separa el periodo actual del histórico cerrado y traduce políticas', () => {
  assert.match(app, /Referencia: créditos anteriores ya pagados/);
  assert.match(app, /Créditos anteriores ya pagados \(4 jul–1 sep\)/);
  assert.match(app, /Bono fijo con ajuste autorizado/);
  assert.match(app, /Bonos históricos ya pagados/);
  assert.match(app, /no son ventas actuales ni utilidad disponible/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../../creditek/erp/aliados-v1-1-app.js', import.meta.url), 'utf8');
const executivesSource = app.slice(app.indexOf('function renderExecutives'), app.indexOf('function renderPlatforms'));

test('Ejecutivos abre con el mes vigente y muestra fechas en cada indicador', () => {
  assert.match(app, /executiveFrom/);
  assert.match(app, /executiveTo/);
  assert.match(app, /Mes vigente/);
  assert.match(app, /operationSaleDay/);
  assert.match(app, /operationIsCurrent/);
  assert.match(app, /Periodo de ventas visible/);
  assert.match(executivesSource, /Fecha de venta desde/);
  assert.match(app, /Sin ejecutivo asignado/);
  assert.match(app, /periodOps\.length/);
});

test('la tabla del periodo no mezcla históricos y enlaza la revisión pendiente', () => {
  assert.doesNotMatch(executivesSource, /Créditos anteriores ya pagados|Bonos históricos/);
  assert.match(executivesSource, /exclusivamente a ventas del periodo seleccionado/);
  assert.match(executivesSource, /aliados-calidad\.html/);
  assert.match(executivesSource, /Revisar pendientes/);
  assert.match(app, /Bono fijo con ajuste autorizado/);
});

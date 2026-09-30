import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../creditek/erp/ventas.html', import.meta.url), 'utf8');

test('el detalle de ventas distribuye sus columnas sin que Cliente ensanche toda la tabla', () => {
  assert.match(html, /#tablaVentas \{ min-width:1120px; table-layout:fixed; \}/);
  const widths = [...html.matchAll(/#tablaVentas th:nth-child\((\d+)\) \{ width:(\d+)px; \}/g)];
  assert.equal(widths.length, 10);
  assert.equal(widths.reduce((total, [, , width]) => total + Number(width), 0), 1120);
  assert.ok(Number(widths[4][2]) <= 160, 'Cliente no debe reservar una franja excesiva');
  assert.match(html, /#tablaVentas td:nth-child\(5\),\s*#tablaVentas td:nth-child\(6\),[\s\S]*?white-space:normal; overflow-wrap:anywhere/);
});

test('en pantallas estrechas conserva las fichas de venta legibles', () => {
  assert.match(html, /@media \(max-width: 560px\)[\s\S]*?#tablaVentas \{ min-width:0; \}/);
  assert.match(html, /#tablaVentas, #tablaVentas tbody, #tablaVentas tr, #tablaVentas td \{ display:block; width:100%; \}/);
});

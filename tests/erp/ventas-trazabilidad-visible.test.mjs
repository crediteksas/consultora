import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, domain] = await Promise.all([
  readFile('creditek/erp/ventas.html', 'utf8'),
  readFile('creditek/erp/ventas-domain.js', 'utf8'),
]);

test('la lista hace visibles venta, línea e identificadores sin alterar la operación', () => {
  assert.match(html, /<th>Venta #<\/th><th>Línea<\/th>/);
  assert.match(html, /venta_items\(id, cantidad, precio_venta/);
  assert.match(html, /data-line-id=/);
  assert.match(html, /v\.consecutivo/);
  assert.match(domain, /id: item\.id \|\| null/);
});

test('el detalle cruza la venta con los movimientos reales de inventario', () => {
  assert.match(html, /from\('movimientos'\)/);
  assert.match(html, /eq\('referencia_tipo', 'venta'\)/);
  assert.match(html, /eq\('referencia_id', ventaId\)/);
  assert.match(html, /Trazabilidad KORA/);
  assert.match(html, /Caja: calculada directamente desde esta venta/);
});

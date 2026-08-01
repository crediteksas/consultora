import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(
  new URL('../../creditek/erp/compra-proveedor.html', import.meta.url),
  'utf8',
);

test('el buscador de productos queda por encima de la tabla y mantiene opciones legibles', () => {
  assert.match(html, /#modal-buscar\s*\{[^}]*z-index:\s*1000/s);
  assert.match(html, /\.compra-producto-opcion[^{}]*\{[^}]*background:\s*#fff/s);
  assert.match(html, /\.compra-producto-opcion[^{}]*\{[^}]*color:\s*#0B1E3D/s);
  assert.match(html, /class="[^"]*secondary[^"]*compra-producto-opcion[^"]*"/);
  assert.match(html, /class="[^"]*secondary[^"]*compra-producto-seleccionado[^"]*"/);
});

test('la fila de compra reserva espacio suficiente para costo y margen', () => {
  assert.match(html, /\.compra-items-table\s*\{[^}]*min-width:\s*1180px/s);
  assert.match(html, /\.compra-costo-input\s*\{[^}]*min-width:\s*120px/s);
  assert.match(html, /\.compra-margen-valor\s*\{[^}]*min-width:\s*88px/s);
  assert.match(html, /data-campo="costo_unitario"[\s\S]*class="[^"]*compra-costo-input[^"]*"/);
  assert.match(html, /data-campo="margen_valor"[\s\S]*class="[^"]*compra-margen-valor[^"]*"/);
});

test('los errores de guardado se muestran por encima del shell de KORA', () => {
  assert.match(html, /#toast\s*\{[^}]*z-index:\s*1200/s);
  assert.match(html, /id="toast"[^>]*role="alert"/);
});

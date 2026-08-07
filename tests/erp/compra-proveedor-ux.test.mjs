import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(
  new URL('../../creditek/erp/compra-proveedor.html', import.meta.url),
  'utf8',
);

test('el buscador de productos queda por encima de la tabla y mantiene opciones legibles', () => {
  assert.match(html, /#modal-buscar\s*\{[^}]*z-index:\s*var\(--ctk-z-modal\)/s);
  assert.match(html, /\.compra-producto-opcion[^{}]*\{[^}]*background:\s*var\(--ctk-color-surface\)/s);
  assert.match(html, /\.compra-producto-opcion[^{}]*\{[^}]*color:\s*var\(--ctk-color-text\)/s);
  assert.match(html, /class="[^"]*ctk-dropdown__item[^"]*secondary[^"]*compra-producto-opcion[^"]*"/);
  assert.match(html, /\.compra-buscador-modal #search-results\s*\{[^}]*display:\s*block;[^}]*position:\s*static;[^}]*width:\s*100%/s);
  assert.match(html, /class="[^"]*secondary[^"]*compra-producto-seleccionado[^"]*"/);
  assert.match(html, /class="ctk-modal compra-buscador-modal" role="dialog" aria-modal="true"/);
});

test('la fila de compra reserva espacio suficiente para costo y margen', () => {
  assert.match(html, /\.compra-items-table\s*\{[^}]*min-width:\s*1180px/s);
  assert.match(html, /\.compra-costo-input\s*\{[^}]*min-width:\s*120px/s);
  assert.match(html, /\.compra-margen-valor\s*\{[^}]*min-width:\s*88px/s);
  assert.match(html, /data-campo="costo_unitario"[\s\S]*class="[^"]*compra-costo-input[^"]*"/);
  assert.match(html, /data-campo="margen_valor"[\s\S]*class="[^"]*compra-margen-valor[^"]*"/);
});

test('los errores de guardado se muestran por encima del shell de KORA', () => {
  assert.match(html, /#toast\s*\{[^}]*z-index:\s*var\(--ctk-z-toast\)/s);
  assert.match(html, /id="toast"[^>]*role="alert"/);
});

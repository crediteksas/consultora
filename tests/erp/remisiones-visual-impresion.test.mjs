import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const listado = await readFile(path.join(root, 'creditek/erp/remisiones.html'), 'utf8');
const documento = await readFile(path.join(root, 'creditek/erp/documento-remision.html'), 'utf8');

test('los modales de remisiones no quedan debajo de tablas y restauran el foco', () => {
  assert.match(listado, /z-index:\s*1200/);
  assert.match(listado, /role="dialog"\s+aria-modal="true"/);
  assert.match(listado, /event\.key !== 'Escape'/);
  assert.match(listado, /modal\._activador\?\.focus/);
  assert.match(listado, /\.modal-box table thead \{ position:static/);
});

test('la impresión excluye navegación y usa formato carta paginado', () => {
  assert.match(documento, /@page \{ size: letter/);
  assert.match(documento, /\.no-print \{ display: none !important/);
  assert.match(documento, /thead \{ display: table-header-group/);
  assert.match(documento, /break-inside: avoid/);
  assert.match(documento, /window\.print\(\)/);
});

test('el documento contiene identidad, datos, productos, responsables y firmas', () => {
  assert.match(documento, /creditek_logo_corregido_alta\.png/);
  for (const texto of ['REMISIÓN #', 'Origen', 'Destino', 'Estado', 'Producto', 'Código', 'Categoría', 'Cantidad', 'Precio unitario', 'TOTAL', 'Entrega — Bodega Central', 'Recibe — Tienda destino']) {
    assert.match(documento, new RegExp(texto));
  }
  assert.match(documento, /Documento generado electrónicamente por KORA/);
  assert.match(documento, /productos\(id, codigo, nombre/);
});

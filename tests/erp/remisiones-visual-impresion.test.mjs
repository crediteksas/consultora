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
  assert.match(documento, /\/creditek\/shared\/branding\/creditek-logo\.png/);
  for (const texto of ['REMISIÓN #', 'Origen', 'Destino', 'Estado', 'Producto', 'Código', 'Categoría', 'Cantidad', 'Precio unitario', 'TOTAL', 'Entrega — Bodega Central', 'Recibe — Tienda destino']) {
    assert.match(documento, new RegExp(texto));
  }
  assert.match(documento, /Documento generado electrónicamente por KORA/);
  assert.match(documento, /doc-trace-id/);
  assert.match(documento, /doc-audit-footer/);
  assert.match(documento, /print-color-adjust:\s*exact/);
  assert.match(documento, /productos\(id, codigo, nombre/);
});

test('la remisión impresa libera el ancho del shell y no imprime su barra', () => {
  const print = documento.slice(documento.indexOf('@media print'), documento.indexOf('button,input,select'));
  assert.match(print, /#app \.kora-sidebar, #app \.kora-topbar/);
  assert.match(print, /main#app:not\(\.hidden\), #app \.kora-shell-main, #app \.kora-shell-content/);
  assert.match(print, /display: block !important; position: static !important/);
  assert.match(print, /width: 100% !important; max-width: none !important/);
  assert.match(print, /height: auto !important; min-height: 0 !important; max-height: none !important/);
});

test('la impresión recupera la tabla desde las tarjetas móviles y totaliza solo al final', () => {
  assert.match(documento, /#app table \{ display: table !important; table-layout: fixed !important/);
  assert.match(documento, /#app table tbody, #app table tfoot \{ display: table-row-group !important/);
  assert.match(documento, /#app table tr \{ display: table-row !important/);
  assert.match(documento, /#app table :is\(th, td\) \{ display: table-cell !important/);
  assert.match(documento, /#app table td::before \{ display: none !important/);
  assert.match(documento, /#app table th:nth-child\(3\) \{ width: 36%/);
  assert.doesNotMatch(documento, /display: table-footer-group/);
  assert.match(documento, /#app \.firma-grid \{ break-inside: avoid/);
});

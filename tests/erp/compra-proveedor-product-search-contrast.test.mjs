import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const html = await readFile(path.join(root, 'creditek/erp/compra-proveedor.html'), 'utf8');

test('el buscador de compras usa controles neutrales y resultados alineados a la izquierda', () => {
  assert.match(html, /\.compra-producto-opcion,[\s\S]*?background:\s*var\(--ctk-color-surface\);[\s\S]*?color:\s*var\(--ctk-color-text\)/);
  assert.match(html, /#search-results \.compra-producto-opcion\s*\{[^}]*justify-content:\s*flex-start/s);
  assert.match(html, /#cerrar-modal\s*\{[^}]*flex:\s*0 0 auto/);
  assert.match(html, /data-prod-id=/);
  assert.match(html, /data-buscar-idx=/);
});

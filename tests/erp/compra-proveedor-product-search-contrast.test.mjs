import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

test('las filas del buscador de productos no heredan el botón primario oscuro', async () => {
  const html = await readFile(path.join(root, 'creditek/erp/compra-proveedor.html'), 'utf8');

  assert.match(
    html,
    /data-prod-id="\$\{esc\(p\.id\)\}"[\s\S]*?class="[^"]*\bsecondary\b[^"]*\bkora-product-search-result\b/,
  );
});

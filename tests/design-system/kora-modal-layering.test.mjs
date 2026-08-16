import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => readFile(path.join(root, relative), 'utf8');

test('el componente compartido mantiene modales por encima de tablas sticky', async () => {
  const [tokens, productCss] = await Promise.all([
    read('design-system/tokens/index.css'),
    read('design-system/components/kora-product.css'),
  ]);

  assert.match(tokens, /--ctk-z-sticky:\s*100/);
  assert.match(tokens, /--ctk-z-modal:\s*700/);
  assert.match(
    productCss,
    /\.kora-product-page \.modal-bg\s*\{[^}]*z-index:\s*var\(--ctk-z-modal\)/s,
  );
});

test('Traslados, Gastos y Remisiones reutilizan la corrección global', async () => {
  for (const page of ['traslados.html', 'gastos.html', 'remisiones.html', 'ajustes.html']) {
    const html = await read(`creditek/erp/${page}`);
    assert.match(html, /class="modal-bg/);
    assert.match(html, /\/design-system\/components\/kora-product\.css/);
    assert.match(html, /\/design-system\/components\/kora-product\.js/);
  }
});

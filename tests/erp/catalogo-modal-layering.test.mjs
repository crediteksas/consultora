import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(
  new URL('../../creditek/erp/catalogo.html', import.meta.url),
  'utf8',
);

test('el formulario de producto queda por encima del encabezado fijo del catálogo', () => {
  const modalRule = html.match(/\.modal-bg\s*\{([^}]+)\}/s)?.[1] || '';
  const zIndex = Number(modalRule.match(/z-index:\s*(\d+)/)?.[1] || 0);

  assert.ok(
    zIndex > 100,
    `el modal debe superar el z-index 100 del encabezado fijo; recibió ${zIndex}`,
  );
});

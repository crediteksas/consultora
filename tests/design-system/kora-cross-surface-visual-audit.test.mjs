import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const css = await readFile(path.join(root, 'design-system/components/kora-product.css'), 'utf8');

test('la capa compartida normaliza encabezados, filtros, tablas y modales', () => {
  assert.match(css, /KORA visual audit/);
  assert.match(css, /\.kora-product-page :where\(\.page-header\)[\s\S]*flex-direction: column/);
  assert.match(css, /overscroll-behavior-inline: contain/);
  assert.match(css, /max-height: calc\(100dvh - 32px\)/);
  assert.match(css, /@media \(hover: none\)/);
});

test('la adaptación móvil convierte filtros en una sola columna', () => {
  assert.match(css, /@media \(max-width: 47\.999rem\)[\s\S]*\.filter-row\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /max-width: calc\(100vw - 16px\)/);
});

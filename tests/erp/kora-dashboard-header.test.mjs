import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

test('el encabezado del tablero muestra un único título y breadcrumb compacto', async () => {
  const html = await readFile(path.join(root, 'creditek/erp/tablero.html'), 'utf8');

  assert.doesNotMatch(html, /Vista consolidada/i);
  assert.equal((html.match(/Resumen ejecutivo/g) || []).length, 1);
  assert.match(html, /El pulso comercial y operativo de Creditek, en una sola vista\./);
  assert.match(html, /setContext\('Resumen ejecutivo', \['KORA', 'Tablero'\]\)/);
  assert.match(html, /addEventListener\('kora-sidebar-ready', sincronizarEncabezado, \{ once: true \}\)/);
});

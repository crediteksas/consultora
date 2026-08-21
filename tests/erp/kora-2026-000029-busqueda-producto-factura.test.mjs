import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const compra = await readFile(path.join(root, 'creditek/erp/compra-proveedor.html'), 'utf8');

test('auditoria conserva acceso a Crear factura junto con gerencia', () => {
  assert.match(compra, /rolActual !== 'gerencia' && rolActual !== 'auditoria'/);
});

test('la carga de productos incluye código y no filtra por tienda', () => {
  const consulta = compra.match(/SB\.from\('productos'\)[\s\S]*?\.order\('nombre'\)/)?.[0] || '';
  assert.match(consulta, /select\('id, codigo, nombre, categoria, tipo, margen_tipo, margen_valor'\)/);
  assert.match(consulta, /eq\('activo', true\)/);
  assert.doesNotMatch(consulta, /tienda_codigo/);
});

test('el buscador encuentra productos por código, nombre o categoría', () => {
  assert.match(compra, /p\.codigo \+ ' ' \+ p\.nombre \+ ' ' \+ p\.categoria/);
  assert.match(compra, /\$\{esc\(p\.codigo\)\} · \$\{esc\(p\.categoria\)\}/);
  assert.match(compra, /\.slice\(0, 30\)/);
});

test('el desplegable de resultados conserva el fix de visibilidad', () => {
  assert.match(compra, /\.compra-buscador-modal #search-results\s*\{[^}]*display:\s*block;[^}]*position:\s*static;[^}]*width:\s*100%/s);
});

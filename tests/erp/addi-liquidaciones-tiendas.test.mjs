import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../../creditek/erp/aliados-liquidaciones-app.js', import.meta.url), 'utf8');
const page = await readFile(new URL('../../creditek/erp/aliados-liquidaciones.html', import.meta.url), 'utf8');

test('Liquidaciones Addi usa el nombre oficial y la ciudad, no el código CK', () => {
  assert.match(app, /sb\.from\('origenes'\)\.select\('codigo,nombre,ciudad'\)/);
  assert.match(app, /storeByCode\.get\(row\.tienda_codigo\)/);
  assert.match(app, /esc\(storeName\)/);
  assert.match(app, /esc\(location\)/);
  assert.doesNotMatch(app, /esc\(row\.tienda_codigo\)/);
});

test('un nombre no resuelto bloquea la acción y nunca se presenta como código de tienda', () => {
  assert.match(app, /!storeName \? 'Revisar nombre de tienda en catálogo'/);
  assert.match(app, /'Tienda sin identificar'/);
});

test('el cuadro Addi compacta columnas sin esconder el IVA ni la utilidad', () => {
  const section = page.match(/<section class="card" id="addiFollowup"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section);
  assert.equal((section.match(/<th>/g) || []).length, 8);
  assert.doesNotMatch(section, /<th>Política<\/th>/);
  assert.match(section, /<th>Descuento Addi<\/th>/);
  assert.match(section, /<th>Utilidad<\/th>/);
  assert.match(app, /String\(row\.fecha_esperada \|\| ''\)\.slice\(2,10\)/);
  assert.match(app, /<details class="addi-base-detail">/);
  assert.match(page, /@media\(max-width:850px\).*#addiFollowup tbody tr/);
});

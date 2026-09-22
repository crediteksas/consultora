import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../../creditek/erp/aliados-liquidaciones-app.js', import.meta.url), 'utf8');

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

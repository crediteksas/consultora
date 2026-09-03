import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile('creditek/erp/caja.html', 'utf8');
const cargar = html.slice(html.indexOf('async function cargarCuadrito'), html.indexOf('async function cerrarCajaAccion'));
const compartir = html.slice(html.indexOf('function compartirCuadritoWA'), html.indexOf('// ─── Vista central'));

test('el cierre resuelve el nombre comercial desde el código interno', () => {
  assert.match(cargar, /from\('origenes'\)\.select\('nombre'\)/);
  assert.match(cargar, /origenResult\.data\?\.nombre \|\| tienda/);
  assert.doesNotMatch(cargar, /currentPerfil\.tienda_codigo \|\| tienda/);
});

test('el mensaje resume accesorios sin enumerar referencias', () => {
  assert.match(compartir, /accesoriosUnidades/);
  assert.match(compartir, /accesoriosTotal/);
  assert.match(compartir, /unidades/);
  assert.doesNotMatch(compartir, /c\.accesorios\.map/);
});

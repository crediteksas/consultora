import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(
  new URL('../../creditek/erp/catalogo.html', import.meta.url),
  'utf8',
);

test('catálogo conserva el shell KORA y los flujos de foto de tienda y central', () => {
  assert.doesNotMatch(html, /^(?:<<<<<<<|=======|>>>>>>>)/m);
  assert.match(html, /window\.__KORA_ENV__/);
  assert.match(html, /kora-access-control\.js/);

  assert.match(html, /<script src="producto-foto\.js"><\/script>/);
  assert.match(html, /window\.CreditekProductoFoto/);
  assert.match(html, /id="modalFotoProducto"/);
  assert.match(html, /function abrirModalFoto\(/);
  assert.match(html, /function cerrarModalFoto\(/);
  assert.match(html, /function previsualizarFotoTienda\(/);
  assert.match(html, /function guardarFotoProducto\(/);
  assert.match(html, /addEventListener\('click', cerrarModalFoto\)/);
  assert.match(html, /addEventListener\('click', guardarFotoProducto\)/);

  assert.match(html, /id="btnEliminarFotoProducto"/);
  assert.match(html, /function eliminarFotoProducto\(/);
  assert.match(html, /rpc\('gestionar_foto_producto_central'/);
  assert.match(html, /canonicas\/\$\{productoId\}/);
});

test('catálogo recarga categorías con la función existente', () => {
  assert.match(html, /function cargarCategorias\(/);
  assert.doesNotMatch(html, /cargarCategoriasExistentes\(/);
  assert.match(html, /await cargarCategorias\(\)/);
});

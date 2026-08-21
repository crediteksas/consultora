import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const compra = await readFile(path.join(root, 'creditek/erp/compra-proveedor.html'), 'utf8');

test('sin resultados ofrece crear una referencia nueva', () => {
  assert.match(compra, /hits\.length === 0[\s\S]*?id="btn-crear-referencia"[\s\S]*?Crear referencia nueva/);
});

test('modal KORA contiene nombre, código, categoría y precio sin imagen', () => {
  const modal = compra.match(/<div id="modal-crear-referencia"[\s\S]*?<\/section>\s*<\/div>/)?.[0] || '';
  assert.match(modal, /class="ctk-modal"/);
  for (const id of ['referencia-nombre', 'referencia-codigo', 'referencia-categoria', 'referencia-precio']) {
    assert.match(modal, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(modal, /type="file"|imagen|foto/i);
});

test('campos obligatorios y código duplicado bloquean el guardado', () => {
  assert.match(compra, /if \(!nombre \|\| !codigo \|\| !categoria \|\| !Number\.isFinite\(precio\) \|\| precio <= 0\)/);
  assert.match(compra, /productoFoto\.buscarProductoPorCodigo\(\{ sb: SB, codigo \}\)/);
  assert.match(compra, /Ya existe un producto con ese código\./);
  assert.match(compra, /error\.code === '23505'/);
});

test('producto se crea sin imagen y queda seleccionado con el precio sugerido', () => {
  assert.match(compra, /foto_url:\s*null/);
  assert.match(compra, /productos\.push\(data\)/);
  assert.match(compra, /seleccionarProducto\(data\.id, precio\)/);
  assert.match(compra, /it\.precio_remision = Number\(precioSugerido\)/);
  assert.match(compra, /it\.precio_manual = true/);
});

test('solo gerencia y auditoria pueden crear referencias', () => {
  assert.match(compra, /rolActual !== 'gerencia' && rolActual !== 'auditoria'/);
  assert.match(compra, /No tienes permiso para crear referencias\./);
  assert.doesNotMatch(compra, /rolActual === 'admin_tienda'/);
});

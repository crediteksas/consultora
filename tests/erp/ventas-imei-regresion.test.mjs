import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const html = await readFile(path.join(root, 'creditek/erp/ventas.html'), 'utf8');

test('el reporte consulta el IMEI desde la unidad vendida y la financiera real', () => {
  assert.match(html, /unidades\(imei\)/);
  assert.match(html, /creditos\(financiera\)/);
});

test('el reporte muestra las columnas operativas solicitadas', () => {
  for (const encabezado of [
    'Fecha',
    'Tienda',
    'Cliente',
    'Referencia',
    'IMEI',
    'Plataforma',
    'Valor',
    'Vendedor',
  ]) {
    assert.match(html, new RegExp(`<th>${encabezado}</th>`));
  }
});

test('cada línea conserva referencia, IMEI y valor sin repetir el total de la venta', () => {
  assert.match(html, /it\?\.unidades\?\.imei/);
  assert.match(html, /Number\(it\.precio_venta \|\| 0\) \* Number\(it\.cantidad \|\| 0\)/);
  assert.doesNotMatch(html, /<td>\$\{fmtCOP\(v\.total\)\}<\/td>/);
});

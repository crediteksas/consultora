import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../..');
const domainPath = path.join(root, 'creditek/erp/ventas-utilidad-domain.js');
const migrationPath = path.join(
  root,
  'creditek/erp/migrations/20260727_utilidad_tienda_costo_remision.sql'
);

test('calcula utilidad con precio negociado y costo de remisión congelado', async () => {
  assert.equal(existsSync(domainPath), true, 'falta el dominio de utilidad de tienda');
  const source = await readFile(domainPath, 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context);

  const resultado = context.window.CreditekVentasUtilidad.calcular({
    precioVenta: 729000,
    costoRemisionCongelado: 520000,
    cantidad: 1,
  });

  assert.equal(resultado.utilidad, 209000);
  assert.equal(resultado.totalVenta, 729000);
  assert.equal(resultado.totalCostoRemision, 520000);
});

test('la persistencia congela precio_tienda y no usa costos centrales', async () => {
  assert.equal(existsSync(migrationPath), true, 'falta la migración mínima de utilidad');
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

  assert.match(sql, /costo_remision_congelado/);
  assert.match(sql, /u\.precio_tienda/);
  assert.match(sql, /sc\.precio_tienda/);
  assert.match(sql, /new\.utilidad/);
  assert.doesNotMatch(sql, /u\.costo_remision|costo_promedio|costo_proveedor|costo_real/);
});

test('la pantalla conserva el precio real negociado en el payload', async () => {
  const html = await readFile(path.join(root, 'creditek/erp/ventas.html'), 'utf8');

  assert.match(html, /ventas-utilidad-domain\.js/);
  assert.match(html, /ventasUtilidad\.calcular/);
  assert.match(html, /precio_venta:\s*it\.precio_venta/);
  assert.doesNotMatch(html, /precio_venta:\s*it\.precio_minimo/);
});

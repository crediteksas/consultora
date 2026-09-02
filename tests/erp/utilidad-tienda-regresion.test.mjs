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
  'supabase/migrations/20260902190000_kora_utilidad_sobre_costo_real.sql'
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

test('la persistencia congela el costo real y nunca el precio sugerido', async () => {
  assert.equal(existsSync(migrationPath), true, 'falta la migración correctiva de utilidad');
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

  assert.match(sql, /costo_remision_congelado/);
  assert.match(sql, /u\.costo_remision/);
  assert.match(sql, /sc\.costo_promedio/);
  assert.match(sql, /new\.utilidad/);
  assert.doesNotMatch(sql, /v_costo\s*:=\s*v_unidad\.precio_tienda|v_costo\s*:=\s*v_stock\.precio_tienda/);
});

test('la pantalla conserva el precio real negociado en el payload', async () => {
  const html = await readFile(path.join(root, 'creditek/erp/ventas.html'), 'utf8');

  assert.match(html, /ventas-utilidad-domain\.js/);
  assert.match(html, /ventasUtilidad\.calcular/);
  assert.match(html, /precio_venta:\s*it\.precio_venta/);
  assert.doesNotMatch(html, /precio_venta:\s*it\.precio_minimo/);
  assert.match(html, /costoRemisionCongelado:\s*it\.costo_unitario/);
});

test('reportes separa precio sugerido de costo real y valoriza inventario al costo', async () => {
  const reportes = await readFile(path.join(root, 'creditek/erp/reportes.html'), 'utf8');

  assert.match(reportes, /Inventario \(costo real\)/);
  assert.match(reportes, /Valor a precio sugerido/);
  assert.match(reportes, /uns\.reduce\(\(s, u\) => s \+ Number\(u\.costo_remision \?\? 0\)/);
  assert.match(reportes, /Number\(r\.cantidad \|\| 0\) \* Number\(r\.costo_promedio \?\? 0\)/);
});

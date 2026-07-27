import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../..');
const domainPath = path.join(root, 'creditek/erp/inventario-costo-domain.js');
const migrationPath = path.join(
  root,
  'creditek/erp/migrations/20260727_costo_promedio_accesorios.sql'
);

test('promedia 10 accesorios de 5.200 con 10 nuevos de 7.011', async () => {
  assert.equal(existsSync(domainPath), true, 'falta el dominio de costo promedio');
  const source = await readFile(domainPath, 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context);

  const promedio = context.window.CreditekInventarioCosto.calcularPromedioPonderado({
    stockAnterior: 10,
    costoAnterior: 5200,
    cantidadEntrada: 10,
    costoEntrada: 7011,
  });

  assert.equal(promedio, 6105.5);
});

test('una primera entrada adopta su costo unitario', async () => {
  assert.equal(existsSync(domainPath), true, 'falta el dominio de costo promedio');
  const source = await readFile(domainPath, 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context);

  assert.equal(context.window.CreditekInventarioCosto.calcularPromedioPonderado({
    stockAnterior: 0,
    costoAnterior: 0,
    cantidadEntrada: 4,
    costoEntrada: 7011,
  }), 7011);
});

test('la recepción bloquea stock y actualiza solo productos por cantidad', async () => {
  assert.equal(existsSync(migrationPath), true, 'falta la migración mínima de promedio');
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

  assert.match(sql, /from public\.stock_cantidad[\s\S]*for update/);
  assert.match(sql, /p\.tipo = 'cantidad'/);
  assert.match(sql, /new\.tipo = 'compra_entrada'/);
  assert.match(sql, /\(v_stock_anterior \* v_costo_anterior\)[\s\S]*\(new\.cantidad \* new\.costo\)/);
  assert.doesNotMatch(sql, /update public\.unidades/);
  assert.doesNotMatch(sql, /stock_cantidad_lotes/);
});

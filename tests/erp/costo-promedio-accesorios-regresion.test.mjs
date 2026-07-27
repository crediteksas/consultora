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
  'creditek/erp/migrations/20260727_corrige_costo_promedio_accesorios.sql'
);

test('promedia 10 accesorios de 5.200 con 10 nuevos de 7.011', async () => {
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

test('pondera cantidades diferentes sin reemplazar todo al último costo', async () => {
  const source = await readFile(domainPath, 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context);

  const costo = context.window.CreditekInventarioCosto.calcularPromedioPonderado({
    stockAnterior: 10,
    costoAnterior: 7011,
    cantidadEntrada: 2,
    costoEntrada: 9120,
  });

  assert.equal(costo, 7362.5);
  assert.notEqual(costo, 9120);
});

test('la utilidad posterior usa el costo promedio congelado', async () => {
  const source = await readFile(domainPath, 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context);

  assert.deepEqual(
    { ...context.window.CreditekInventarioCosto.calcularCostoVentaAccesorio({
      cantidad: 3,
      precioVentaUnitario: 12000,
      costoPromedioUnitario: 7362.5,
    }) },
    { costoCongeladoUnitario: 7362.5, costoTotal: 22087.5, utilidad: 13912.5 }
  );
});

test('la actualización pondera antes de perder el costo anterior', async () => {
  assert.equal(existsSync(migrationPath), true, 'falta la migración correctiva');
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

  assert.match(sql, /before update of cantidad, costo_promedio/);
  assert.match(sql, /\(old\.cantidad \* old\.costo_promedio\)/);
  assert.match(sql, /\(\(new\.cantidad - old\.cantidad\) \* new\.costo_promedio\)/);
  assert.match(sql, /p\.tipo = 'cantidad'/);
  assert.match(sql, /new\.tienda_codigo <> 'central'/);
  assert.doesNotMatch(sql, /update public\.unidades/);
});

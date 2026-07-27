import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../..');
const domainPath = path.join(root, 'creditek/erp/inventario-costo-domain.js');

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

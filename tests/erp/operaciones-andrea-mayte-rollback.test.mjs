import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const rollback = (await readFile(
  path.join(root, 'creditek/erp/migrations/rollback/20260727_operaciones_andrea_mayte_rollback.sql'),
  'utf8'
)).replace(/\s+/g, ' ').toLowerCase();

test('el rollback deshabilita funciones nuevas sin borrar datos', () => {
  for (const fn of [
    'registrar_abono_cuenta_corriente',
    'registrar_compra_proveedor_operativa',
    'crear_cliente_interno_seguro',
    'consultar_utilidad_creditek_rango',
  ]) assert.match(rollback, new RegExp(`drop function if exists public\\.${fn}`));
  assert.doesNotMatch(rollback, /drop table|drop column|truncate|delete from/);
});

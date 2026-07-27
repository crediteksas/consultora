import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const migrationPath = path.join(
  root,
  'creditek/erp/migrations/20260727_resumen_cartera_proveedores.sql'
);
const sql = (await readFile(migrationPath, 'utf8')).replace(/\s+/g, ' ').trim().toLowerCase();

test('agrega vencimiento sin alterar saldos históricos', () => {
  assert.match(sql, /add column if not exists fecha_vencimiento date/);
  assert.doesNotMatch(sql, /update public\.facturas_proveedor set saldo/);
});

test('la asignación de vencimiento está restringida a roles centrales', () => {
  assert.match(sql, /create or replace function public\.registrar_compra_proveedor_con_vencimiento/);
  assert.match(sql, /if not coalesce\(public\.es_central\(\), false\)/);
  assert.match(sql, /revoke all on function public\.registrar_compra_proveedor_con_vencimiento/);
  assert.match(sql, /grant execute on function public\.registrar_compra_proveedor_con_vencimiento/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const migrationPath = path.join(
  root,
  'creditek/erp/migrations/20260727_cuentas_por_pagar_proveedores.sql'
);
const normalize = text => text.replace(/\s+/g, ' ').trim().toLowerCase();
const sql = normalize(await readFile(migrationPath, 'utf8'));

test('el detalle de factura está restringido a roles centrales', () => {
  assert.match(sql, /create or replace function public\.obtener_detalle_factura_proveedor/);
  assert.equal(
    (sql.match(/if not coalesce\(public\.es_central\(\), false\)/g) || []).length,
    2
  );
  assert.match(sql, /from public\.pagos_proveedor/);
  assert.match(sql, /revoke all on function public\.obtener_detalle_factura_proveedor/);
});

test('el pago bloquea la factura, impide sobrepago y actualiza el saldo', () => {
  assert.match(sql, /create or replace function public\.registrar_pago_proveedor/);
  assert.match(sql, /from public\.facturas_proveedor[\s\S]*for update/);
  assert.match(sql, /el pago supera el saldo pendiente/);
  assert.match(sql, /update public\.facturas_proveedor[\s\S]*set saldo = saldo - p_monto/);
});

test('el pago conserva el proveedor de la factura', () => {
  assert.match(
    sql,
    /insert into public\.pagos_proveedor \(\s*factura_id,\s*proveedor_id,/
  );
  assert.match(sql, /p_factura_id,\s*v_factura\.proveedor_id,/);
});

test('el pago es idempotente y no se expone a usuarios anónimos', () => {
  assert.match(sql, /idempotency_key/);
  assert.match(sql, /create unique index if not exists pagos_proveedor_idempotency_key_uidx/);
  assert.match(sql, /revoke all on function public\.registrar_pago_proveedor/);
  assert.match(sql, /grant execute on function public\.registrar_pago_proveedor/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const html = await readFile(path.join(root, 'creditek/erp/compra-proveedor.html'), 'utf8');
const sql = (await readFile(
  path.join(root, 'creditek/erp/migrations/20260727_compra_contado_tesoreria.sql'),
  'utf8'
)).replace(/\s+/g, ' ').toLowerCase();

test('la compra permite crédito o contado sin alterar el flujo de ítems', () => {
  assert.match(html, /id="tipo-compra"/);
  assert.match(html, /value="credito"/);
  assert.match(html, /value="contado"/);
  assert.match(html, /id="fuente-fondos"/);
  assert.match(html, /registrar_compra_proveedor_operativa/);
  assert.match(html, /p_items: payload/);
});

test('la compra de contado ingresa inventario, paga la factura y registra tesorería atómicamente', () => {
  assert.match(sql, /v_resultado := public\.registrar_compra_proveedor/);
  assert.match(sql, /v_pago := public\.registrar_pago_proveedor/);
  assert.match(sql, /insert into public\.movimientos_tesoreria_central/);
  assert.match(sql, /p_tipo_compra = 'contado'/);
  assert.match(sql, /'pagada', p_tipo_compra = 'contado'/);
});

test('la operación es central, idempotente y no cambia compras a crédito', () => {
  assert.match(sql, /if not coalesce\(public\.es_central\(\), false\)/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /facturas_proveedor_operacion_idempotency_uidx/);
  assert.match(sql, /case when p_tipo_compra = 'credito' then p_fecha_vencimiento else null end/);
  assert.match(sql, /revoke all .* from public, anon/);
});

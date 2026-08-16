import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const html = await readFile(path.join(root, 'creditek/erp/cuenta-corriente.html'), 'utf8');
const sql = (await readFile(
  path.join(root, 'creditek/erp/migrations/20260728_verificar_abono_proveedor.sql'),
  'utf8',
)).replace(/\s+/g, ' ').toLowerCase();

test('auditoría verifica mediante RPC y selecciona la factura de proveedor', () => {
  assert.match(html, /id="modalVerificarAbono"/);
  assert.match(html, /id="verificarFactura"[^>]*required/);
  assert.match(html, /rpc\('verificar_abono_y_registrar_pago'/);
  assert.doesNotMatch(html, /from\('abonos'\)\.update/);
});

test('la verificación es central, atómica e idempotente', () => {
  assert.match(sql, /create or replace function public\.verificar_abono_y_registrar_pago/);
  assert.match(sql, /v_perfil\.rol not in \('gerencia', 'auditoria'\)/);
  assert.match(sql, /from public\.abonos[\s\S]*for update/);
  assert.match(sql, /public\.registrar_pago_proveedor/);
  assert.match(sql, /p_request_id/);
  assert.match(sql, /verificado_at is not null/);
  assert.match(sql, /revoke all on function public\.verificar_abono_y_registrar_pago/);
});

test('verificar no vuelve a aplicar el abono a la deuda de tienda', () => {
  assert.doesNotMatch(sql, /insert into public\.cuenta_corriente/);
  assert.match(sql, /movimiento de cuenta corriente no encontrado/);
  assert.match(sql, /count\(\*\)[\s\S]*referencia_tipo = 'abono'/);
});

test('la cuenta corriente recibe el estado de verificación desde un RPC filtrado', () => {
  assert.match(sql, /create or replace function public\.listar_cuenta_corriente_con_abonos/);
  assert.match(sql, /to_jsonb\(cc\)[\s\S]*verificado_at/);
  assert.match(html, /rpc\('listar_cuenta_corriente_con_abonos'/);
});

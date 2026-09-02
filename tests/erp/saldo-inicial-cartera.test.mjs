import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const html = await readFile(path.join(root, 'creditek/erp/cuenta-corriente.html'), 'utf8');
const sql = await readFile(path.join(root, 'supabase/migrations/20260902213355_saldo_inicial_cartera.sql'), 'utf8');

test('el formulario exige tienda, corte, monto, concepto y soporte', () => {
  for (const id of ['saldoInicialTienda', 'saldoInicialFecha', 'saldoInicialMonto', 'saldoInicialConcepto', 'saldoInicialSoporte']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /No modifica caja, ventas ni inventario/);
});

test('el saldo inicial se registra mediante RPC y no escribe otros procesos', () => {
  assert.match(html, /rpc\('registrar_saldo_inicial_cartera'/);
  assert.match(sql, /insert into public\.cuenta_corriente/i);
  assert.match(sql, /'cargo'/);
  assert.doesNotMatch(sql, /insert into public\.(?:ventas|movimientos_caja_tienda|inventario)/i);
});

test('la migración limita la carga a una por tienda y exige rol central', () => {
  assert.match(sql, /unique \(tienda_codigo\)/i);
  assert.match(sql, /v_perfil\.rol not in \('gerencia', 'auditoria'\)/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /idempotency_key uuid not null unique/i);
});

test('la operación conserva soporte y auditoría', () => {
  assert.match(sql, /soporte_path text not null/i);
  assert.match(sql, /registrar_saldo_inicial_cartera/i);
  assert.match(sql, /insert into public\.audit_log/i);
  assert.match(html, /btn-ver-saldo-inicial/);
});

test('la función privilegiada no queda abierta a público ni anónimo', () => {
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = public, pg_temp/i);
  assert.match(sql, /revoke all on function public\.registrar_saldo_inicial_cartera[\s\S]*from public, anon/i);
  assert.match(sql, /grant execute on function public\.registrar_saldo_inicial_cartera[\s\S]*to authenticated/i);
});

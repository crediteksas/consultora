import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const html = await readFile(path.join(root, 'public/creditek/erp/proveedores.html'), 'utf8');
const mirror = await readFile(path.join(root, 'creditek/erp/proveedores.html'), 'utf8');
const sql = await readFile(path.join(root, 'supabase/migrations/20260902222454_saldo_inicial_proveedores_b2b.sql'), 'utf8');

test('Maite conserva el alta de proveedores y recibe la acción de saldo inicial', () => {
  assert.match(html, /id="form-proveedor"/);
  assert.match(html, /data-saldo-inicial/);
  assert.match(html, /id="form-saldo-inicial"/);
  assert.match(html, /Fecha de corte/);
  assert.match(html, /Valor pendiente/);
  assert.match(html, /Soporte/);
});

test('el saldo inicial usa una obligación B2B pagable sin crear mercancía ni caja', () => {
  assert.match(sql, /insert into public\.facturas_proveedor/i);
  assert.match(sql, /origen_registro[\s\S]*'saldo_inicial'/i);
  assert.doesNotMatch(sql, /insert into public\.(?:movimientos|remisiones|inventario|movimientos_caja_tienda)/i);
  assert.match(html, /No crea compras, mercancía, remisiones, inventario ni movimientos de caja/);
});

test('solo existe una carga por proveedor y el reintento es idempotente', () => {
  assert.match(sql, /facturas_proveedor_saldo_inicial_unico/i);
  assert.match(sql, /where origen_registro = 'saldo_inicial'/i);
  assert.match(sql, /operacion_idempotency_key = p_idempotency_key/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
});

test('la autorización y auditoría se controlan en servidor', () => {
  assert.match(sql, /v_perfil\.rol not in \('gerencia', 'auditoria'\)/i);
  assert.match(sql, /insert into public\.audit_log/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = public, pg_temp/i);
  assert.match(sql, /from public, anon/i);
});

test('la pantalla productiva y su espejo conservan el mismo contrato funcional', () => {
  for (const marker of ['registrar_saldo_inicial_proveedor', 'saldo-inicial-soporte', 'Saldo inicial cargado']) {
    assert.match(html, new RegExp(marker));
    assert.match(mirror, new RegExp(marker));
  }
});

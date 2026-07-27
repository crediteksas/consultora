import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const html = await readFile(path.join(root, 'creditek/erp/cuenta-corriente.html'), 'utf8');
const sql = (await readFile(
  path.join(root, 'creditek/erp/migrations/20260727_abonos_caja_atomicos.sql'),
  'utf8'
)).replace(/\s+/g, ' ').toLowerCase();

test('el modal de abono queda por encima de tablas y es accesible', () => {
  assert.match(html, /z-index:\s*1200/);
  assert.match(html, /role="dialog"\s+aria-modal="true"/);
  assert.match(html, /event\.key !== 'Escape'/);
  assert.match(html, /modal\._activador\?\.focus/);
  assert.match(html, /body\.modal-open/);
});

test('el formulario muestra únicamente campos respaldados por la migración', () => {
  for (const id of [
    'abonoFecha', 'abonoTipo', 'abonoTercero', 'abonoConcepto',
    'abonoMonto', 'abonoFuente', 'abonoObservacion', 'abonoResponsable',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /Solo “Efectivo de la tienda” registra una salida en Caja/);
});

test('el abono, cuenta corriente y caja se registran en una sola función idempotente', () => {
  assert.match(sql, /create or replace function public\.registrar_abono_cuenta_corriente/);
  assert.match(sql, /idempotency_key uuid/);
  assert.match(sql, /create unique index if not exists abonos_idempotency_key_uidx/);
  assert.match(sql, /insert into public\.abonos/);
  assert.match(sql, /insert into public\.cuenta_corriente/);
  assert.match(sql, /insert into public\.movimientos_caja_tienda/);
  assert.match(sql, /if p_fuente_fondos = 'efectivo_tienda'/);
  assert.match(sql, /'consignacion'/);
  assert.match(sql, /insert into public\.audit_log/);
});

test('un abono sin afectación de caja no crea movimiento de salida', () => {
  assert.match(sql, /p_fuente_fondos not in \('sin_afectar_caja', 'efectivo_tienda'\)/);
  const condicion = sql.indexOf("if p_fuente_fondos = 'efectivo_tienda'");
  const movimiento = sql.indexOf('insert into public.movimientos_caja_tienda');
  assert.ok(condicion >= 0 && movimiento > condicion);
});

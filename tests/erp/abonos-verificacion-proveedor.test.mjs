import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const html = await readFile(path.join(root, 'creditek/erp/cuenta-corriente.html'), 'utf8');
const sql = (await readFile(
  path.join(root, 'creditek/erp/migrations/20260724_abonos_verificacion_prepare.sql'),
  'utf8',
)).replace(/\s+/g, ' ').toLowerCase();

test('auditoría verifica mediante el RPC canónico vigente', () => {
  assert.match(html, /rpc\('verificar_abono_y_aplicar'/);
  assert.doesNotMatch(html, /from\('abonos'\)\.update/);
});

test('la verificación es exclusiva de gerencia, atómica e idempotente', () => {
  assert.match(sql, /create or replace function public\.verificar_abono_y_aplicar/);
  assert.match(sql, /v_rol is distinct from 'gerencia'/);
  assert.match(sql, /from public\.abonos[\s\S]*for update/);
  assert.match(sql, /verificado_at is not null/);
  assert.match(sql, /revoke all on function public\.verificar_abono_y_aplicar/);
});

test('verificar crea como máximo un movimiento de cuenta corriente', () => {
  assert.match(sql, /create unique index if not exists cuenta_corriente_abono_referencia_unica/);
  assert.match(sql, /where referencia_tipo = 'abono' and referencia_id = v_abono\.id::text for update/);
  assert.match(sql, /if found then[\s\S]*else insert into public\.cuenta_corriente/);
});

test('la cuenta corriente solicita columnas explícitas y conserva el estado de verificación', () => {
  assert.match(html, /cuentaDomain\.columnasMovimientos\(\)/);
  assert.match(html, /cuentaDomain\.columnasAbonos\(\)/);
  assert.match(html, /verificado_at/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const migration = (await readFile(
  path.join(
    root,
    'creditek/erp/migrations/20260731_kora_2026_000015_gastos_pendientes_cierre.sql',
  ),
  'utf8',
)).replace(/\s+/g, ' ').toLowerCase();

test('un gasto registrado bloquea la transición de caja a cerrada', () => {
  assert.match(migration, /new\.estado = 'cerrada'/);
  assert.match(migration, /g\.estado = 'registrado'/);
  assert.match(migration, /g\.tienda_codigo = new\.tienda_codigo/);
  assert.match(migration, /g\.fecha = new\.fecha/);
  assert.match(migration, /gastos pendientes de aprobación/);
});

test('la protección permite gastos aprobados y no altera cierres anteriores', () => {
  assert.match(
    migration,
    /tg_op = 'insert' or old\.estado is distinct from 'cerrada'/,
  );
  assert.doesNotMatch(migration, /\bupdate\s+public\.caja_diaria\b/);
  assert.doesNotMatch(migration, /\bdelete\b|\btruncate\b/);
  assert.doesNotMatch(migration, /preautorizado/);
});

test('la regla queda protegida en base de datos para cualquier ruta de cierre', () => {
  assert.match(
    migration,
    /before insert or update of estado on public\.caja_diaria/,
  );
  assert.match(migration, /execute function public\.bloquear_cierre_con_gastos_pendientes/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const sidebar = await readFile(path.join(root, 'creditek/erp/sidebar.js'), 'utf8');
const sql = (await readFile(
  path.join(root, 'creditek/erp/migrations/20260902_kora_restaurar_capacidad_b2b.sql'),
  'utf8',
)).replace(/\s+/g, ' ').toLowerCase();

test('cada capacidad consultada por el shell tiene una función versionada', () => {
  assert.match(sidebar, /sb\.rpc\(['"]es_admin_b2b['"]\)/);
  assert.match(sql, /create or replace function public\.es_admin_b2b\(\)/);
});

test('la capacidad B2B exige usuario activo y rol central', () => {
  assert.match(sql, /p\.id = auth\.uid\(\)/);
  assert.match(sql, /p\.activo = true/);
  assert.match(sql, /p\.rol in \('gerencia', 'auditoria'\)/);
  assert.match(sql, /revoke all on function public\.es_admin_b2b\(\) from public, anon/);
  assert.match(sql, /grant execute on function public\.es_admin_b2b\(\) to authenticated/);
});

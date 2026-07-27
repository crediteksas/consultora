import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const sql = (await readFile(
  path.join(root, 'creditek/erp/migrations/20260727_utilidad_creditek_rangos.sql'),
  'utf8'
)).replace(/\s+/g, ' ').toLowerCase();

test('mantiene la fórmula financiera validada y la fecha Bogotá', () => {
  assert.match(sql, /ri\.precio_remision \* rm\.cantidad/);
  assert.match(sql, /rm\.costo_oscar \* rm\.cantidad/);
  assert.match(sql, /\(ri\.precio_remision - rm\.costo_oscar\) \* rm\.cantidad/);
  assert.match(sql, /america\/bogota/);
});

test('evita duplicar plataforma y restringe la vista a roles centrales', () => {
  assert.match(sql, /left join lateral/);
  assert.match(sql, /limit 1/);
  assert.match(sql, /security_invoker = on/);
  assert.match(sql, /grant select on public\.utilidad_creditek_rango to authenticated/);
  assert.match(sql, /revoke all on public\.utilidad_creditek_rango from public, anon/);
});

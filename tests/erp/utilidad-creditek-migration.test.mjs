import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const sql = (await readFile(
  path.join(root, 'creditek/erp/migrations/20260727_utilidad_creditek_rangos.sql'),
  'utf8'
)).replace(/\s+/g, ' ').toLowerCase();
const rpcSql = (await readFile(
  path.join(root, 'creditek/erp/migrations/20260727_utilidad_creditek_rpc_seguro.sql'),
  'utf8'
)).replace(/\s+/g, ' ').toLowerCase();
const app = await readFile(path.join(root, 'creditek/erp/utilidad-creditek-app.js'), 'utf8');

test('mantiene la fórmula financiera validada y la fecha Bogotá', () => {
  assert.match(sql, /ri\.precio_remision \* rm\.cantidad/);
  assert.match(sql, /rm\.costo_oscar \* rm\.cantidad/);
  assert.match(sql, /\(ri\.precio_remision - rm\.costo_oscar\) \* rm\.cantidad/);
  assert.match(sql, /america\/bogota/);
});

test('consulta la vista mediante RPC central autorizado sin cambiar la fórmula', () => {
  assert.match(rpcSql, /returns setof public\.utilidad_creditek_rango/);
  assert.match(rpcSql, /security definer/);
  assert.match(rpcSql, /p\.rol in \('gerencia', 'auditoria'\)/);
  assert.match(rpcSql, /where u\.fecha between p_desde and p_hasta/);
  assert.match(rpcSql, /revoke all .* from public, anon/);
  assert.match(app, /rpc\('consultar_utilidad_creditek_rango'/);
});

test('evita duplicar plataforma y restringe la vista a roles centrales', () => {
  assert.match(sql, /left join lateral/);
  assert.match(sql, /limit 1/);
  assert.match(sql, /security_invoker = on/);
  assert.match(sql, /grant select on public\.utilidad_creditek_rango to authenticated/);
  assert.match(sql, /revoke all on public\.utilidad_creditek_rango from public, anon/);
});

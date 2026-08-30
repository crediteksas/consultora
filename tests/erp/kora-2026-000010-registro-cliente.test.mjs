import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const html = await readFile(
  path.join(root, 'creditek/erp/registro-interno.html'),
  'utf8',
);
const sql = (await readFile(
  path.join(
    root,
    'creditek/erp/migrations/20260730_kora_2026_000010_registro_cliente.sql',
  ),
  'utf8',
)).replace(/\s+/g, ' ').toLowerCase();

test('el vendedor se valida nuevamente al guardar y recibe un bloqueo claro', () => {
  assert.match(sql, /where id = auth\.uid\(\)/);
  assert.match(sql, /if not v_perfil\.activo then/);
  assert.match(sql, /vendedor_deshabilitado/);
  assert.match(html, /vendedor_deshabilitado/);
  assert.match(html, /Tu usuario vendedor está deshabilitado/);
});

test('el registro interno usa una fuente admitida sin eliminar la restricción', () => {
  assert.match(sql, /fuente[\s\S]*?'formulario'/);
  assert.doesNotMatch(sql, /'registro_interno'/);
  assert.doesNotMatch(sql, /drop constraint[\s\S]*clientes_fuente_check/);
  assert.doesNotMatch(sql, /disable trigger/);
});

test('el alta permanece atómica y bloquea cédula o celular duplicados', () => {
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /ya_existe_cliente_cedula/);
  assert.match(sql, /ya_existe_cliente_celular/);
  assert.match(sql, /insert into public\.clientes/);
  assert.match(sql, /insert into public\.solicitudes/);
});

test('la pantalla conserva el shell y la superficie moderna aprobada', () => {
  assert.match(html, /sidebar\.js\?v=2\.0\.14" data-kora-shell="1\.0\.0"/);
  assert.match(html, /class="page"/);
  assert.match(html, /class="form-card"/);
  assert.match(html, /--bg:\s*#F5F5F7/);
  assert.match(html, /--surface:\s*#FFFFFF/);
  assert.match(html, /--radius:\s*18px/);
});

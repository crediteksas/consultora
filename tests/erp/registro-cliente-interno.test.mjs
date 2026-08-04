import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const internal = await readFile(path.join(root, 'creditek/erp/registro-interno.html'), 'utf8');
const publicForm = await readFile(path.join(root, 'creditek/erp/registro.html'), 'utf8');
const sidebar = await readFile(path.join(root, 'creditek/erp/sidebar.js'), 'utf8');
const sql = (await readFile(
  path.join(root, 'creditek/erp/migrations/20260727_registro_cliente_interno.sql'),
  'utf8'
)).replace(/\s+/g, ' ').toLowerCase();

test('el registro interno exige sesión y usa un RPC separado', () => {
  assert.match(internal, /data-kora-requires-auth=["']true["']/);
  assert.match(internal, /sidebar\.js\?v=2\.0\.6["'] data-kora-shell=["']1\.0\.0["']/);
  assert.match(internal, /kora-sidebar-ready/);
  assert.match(internal, /window\.creditekSidebar/);
  assert.doesNotMatch(internal, /supabase\.createClient/);
  assert.equal((internal.match(/sidebar\.js/g) || []).length, 1);
  assert.match(internal, /crear_cliente_interno_seguro/);
  assert.match(internal, /classList\.add\(['"]show['"]\)/);
  assert.match(sidebar, /Registrar cliente.*registro-interno\.html/);
});

test('el formulario interno publica sus campos principales al shell', () => {
  for (const field of ['cedula', 'nombre', 'celular', 'ciudad', 'direccion', 'tienda']) {
    assert.match(internal, new RegExp(`id=["']${field}["']`));
  }
  assert.match(internal, /id=["']formCliente["']/);
});

test('el registro público conserva token, expiración y Worker seguro', () => {
  assert.match(publicForm, /get\('t'\)/);
  assert.match(publicForm, /Enlace de registro inválido o vencido/);
  assert.match(publicForm, /\/api\/registro/);
  assert.doesNotMatch(publicForm, /crear_cliente_interno_seguro/);
});

test('el backend bloquea duplicados y acceso cruzado entre tiendas', () => {
  assert.match(sql, /v_perfil\.tienda_codigo is distinct from p_origen_codigo/);
  assert.match(sql, /exists \(select 1 from public\.clientes where cedula = p_cedula\)/);
  assert.match(sql, /exists \(select 1 from public\.clientes where celular = p_celular\)/);
  assert.match(sql, /insert into public\.audit_log/);
  assert.match(sql, /revoke all .* from public, anon/);
});

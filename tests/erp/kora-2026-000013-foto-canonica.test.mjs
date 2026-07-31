import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const migrationPath = path.join(
  root,
  'creditek/erp/migrations/20260731_kora_2026_000013_foto_canonica_remision.sql',
);

async function source(relative) {
  return readFile(path.join(root, relative), 'utf8');
}

test('la foto y su historial pertenecen al productos.id exacto', async () => {
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

  assert.match(sql, /create table (if not exists )?public\.producto_foto_historial/);
  assert.match(sql, /producto_id uuid not null[\s\S]*references public\.productos\(id\)/);
  assert.match(sql, /foto_url_anterior text/);
  assert.match(sql, /foto_url_nueva text/);
  assert.match(sql, /after insert or update of foto_url/);
  assert.match(sql, /los registros del historial de fotos son inmutables/);
  assert.doesNotMatch(sql, /where\s+codigo\s*=\s*p_|where\s+nombre\s*=\s*p_/);
});

test('la tienda solo carga una foto faltante de una remisión propia despachada', async () => {
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

  assert.match(sql, /create or replace function public\.registrar_foto_producto_recepcion/);
  assert.match(sql, /from public\.remisiones[\s\S]*for update/);
  assert.match(sql, /from public\.productos[\s\S]*for update/);
  assert.match(sql, /v_remision\.tienda_codigo <> v_perfil\.tienda_codigo/);
  assert.match(sql, /v_remision\.estado <> 'despachada'/);
  assert.match(sql, /from public\.remision_items[\s\S]*producto_id = p_producto_id/);
  assert.match(sql, /coalesce\(v_producto\.foto_url,[\s\S]*is not null/);
});

test('Storage acepta una única ruta canónica y no copias por tienda', async () => {
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

  assert.match(sql, /canonicas\/[^\n]*producto/);
  assert.match(sql, /create policy[\s\S]*productos_fotos_insert_recepcion/);
  assert.match(sql, /storage\.foldername\(name\)/);
  assert.match(sql, /item\.producto_id::text = storage\.filename\(name\)/);
  assert.match(sql, /remision_items/);
  assert.match(sql, /producto\.foto_url is null/);
});

test('Oscar y Maythe pueden reemplazar o eliminar con auditoría', async () => {
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

  assert.match(sql, /create or replace function public\.gestionar_foto_producto_central/);
  assert.match(sql, /v_perfil\.rol not in \('gerencia', 'auditoria'\)/);
  assert.match(sql, /p_foto_url is null/);
  assert.match(sql, /set foto_url =/);
  assert.match(sql, /current_setting\('kora\.foto_origen'/);
});

test('Remisiones carga fotos faltantes antes de confirmar la recepción existente', async () => {
  const html = await source('creditek/erp/remisiones.html');
  const upload = html.indexOf("storage.from('productos-fotos').upload");
  const photoRpc = html.indexOf("rpc('registrar_foto_producto_recepcion'");
  const receiveRpc = html.indexOf("rpc('confirmar_recepcion_remision'");

  assert.match(html, /class="foto-recepcion-input"/);
  assert.match(html, /productos\.foto_url/);
  assert.ok(upload >= 0 && photoRpc > upload && receiveRpc > photoRpc);
  assert.match(html, /canonicas\/\$\{it\.producto_id\}/);
});

test('el documento de remisión usa el mismo contrato y no actualiza productos directamente', async () => {
  const html = await source('creditek/erp/documento-remision.html');

  assert.match(html, /rpc\('registrar_foto_producto_recepcion'/);
  assert.match(html, /canonicas\/\$\{prodId\}/);
  assert.doesNotMatch(html, /from\('productos'\)\.update\(\{ foto_url:/);
});

test('Catálogo reemplaza o elimina mediante el RPC central y la ruta canónica', async () => {
  const html = await source('creditek/erp/catalogo.html');

  assert.match(html, /id="btnEliminarFotoProducto"/);
  assert.match(html, /rpc\('gestionar_foto_producto_central'/);
  assert.match(html, /canonicas\/\$\{productoId\}/);
  assert.match(html, /p_foto_url:\s*null/);
});

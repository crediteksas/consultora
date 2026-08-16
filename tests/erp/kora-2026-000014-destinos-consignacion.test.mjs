import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const migrationPath = path.join(
  root,
  'creditek/erp/migrations/20260731_kora_2026_000014_destinos_consignacion.sql',
);

async function source(file) {
  return readFile(path.join(root, file), 'utf8');
}

test('la migración crea instrucciones dividibles con snapshot bancario inmutable', async () => {
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

  assert.match(sql, /create table (if not exists )?public\.instrucciones_consignacion/);
  assert.match(sql, /banco text not null/);
  assert.match(sql, /numero_cuenta text not null/);
  assert.match(sql, /valor_esperado numeric not null/);
  assert.match(sql, /tipo_destino text not null/);
  assert.doesNotMatch(sql, /unique\s*\(\s*tienda_codigo\s*,\s*fecha\s*\)/);
  assert.match(sql, /before update[\s\S]*instrucciones_consignacion/);
  assert.match(sql, /snapshot bancario.*inmutable|snapshot.*inmutable/);
});

test('la tienda solo envía comprobante y nunca decide el destino', async () => {
  const html = await source('creditek/erp/cuenta-corriente.html');
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

  assert.match(html, /id="tbodyInstrucciones"/);
  assert.match(html, /rpc\('enviar_comprobante_consignacion'/);
  assert.match(sql, /create or replace function public\.enviar_comprobante_consignacion/);
  assert.match(sql, /v_instruccion\.tienda_codigo <> v_perfil\.tienda_codigo/);
  assert.doesNotMatch(
    html,
    /enviar_comprobante_consignacion[\s\S]{0,500}p_(banco|numero_cuenta|tipo_destino|proveedor_id)/,
  );
});

test('la consulta segura oculta proveedor y clasificación interna a la tienda', async () => {
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

  assert.match(sql, /create or replace function public\.listar_instrucciones_consignacion/);
  assert.match(sql, /case when v_perfil\.rol in \('gerencia', 'auditoria'\)/);
  assert.match(sql, /'proveedor_id'/);
  assert.match(sql, /'tipo_destino'/);
  assert.match(sql, /else '\{\}'::jsonb/);
  assert.match(sql, /revoke (insert|all)[\s\S]*instrucciones_consignacion/);
});

test('la aprobación registra una sola vez el abono y la salida de tienda', async () => {
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

  assert.match(sql, /create or replace function public\.decidir_instruccion_consignacion/);
  assert.match(sql, /for update/);
  assert.match(sql, /decision_idempotency_key/);
  assert.match(sql, /insert into public\.abonos/);
  assert.match(sql, /insert into public\.cuenta_corriente/);
  assert.match(sql, /insert into public\.movimientos_caja_tienda/);
  assert.match(sql, /unique[\s\S]*instruccion_id/);
});

test('PROVEEDOR distribuye FIFO y OSCAR solo registra salida B2B', async () => {
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();
  const proveedor = sql.indexOf("v_instruccion.tipo_destino = 'proveedor'");
  const oscar = sql.indexOf("v_instruccion.tipo_destino = 'oscar'");

  assert.ok(proveedor >= 0);
  assert.ok(oscar > proveedor);
  assert.match(
    sql.slice(proveedor, oscar),
    /from public\.facturas_proveedor[\s\S]*order by[\s\S]*fecha[\s\S]*created_at[\s\S]*id[\s\S]*for update/,
  );
  assert.match(sql.slice(proveedor, oscar), /public\.registrar_pago_proveedor/);
  assert.match(sql.slice(proveedor, oscar), /insert into public\.aplicaciones_consignacion_proveedor/);
  assert.doesNotMatch(sql.slice(oscar), /update public\.facturas_proveedor/);
  assert.match(sql.slice(oscar), /insert into public\.movimientos_tesoreria_central/);
});

test('Cuenta Corriente conserva históricos y muestra banco, cuenta, comprobante y estado', async () => {
  const html = await source('creditek/erp/cuenta-corriente.html');

  for (const label of ['Banco', 'Cuenta destino', 'Valor', 'Fecha', 'Comprobante', 'Estado']) {
    assert.match(html, new RegExp(label, 'i'));
  }
  assert.match(html, /destino \|\| '—'/);
  assert.match(html, /pendiente|en_validacion/);
  assert.match(html, /validado/);
  assert.match(html, /rechazado/);
});

test('Cartera de Proveedores explica y muestra la aplicación FIFO', async () => {
  const html = await source('creditek/erp/proveedores.html');

  assert.match(html, /Aplicación FIFO/i);
  assert.match(html, /aplicaciones_consignacion_proveedor/);
  assert.match(html, /orden_fifo/);
});

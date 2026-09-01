import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../..');
const source = await readFile(path.join(root, 'creditek/erp/inventario-import.js'), 'utf8');
const html = await readFile(path.join(root, 'creditek/erp/inventario.html'), 'utf8');
const migrations = await readFile(path.join(root, 'supabase/migrations/20260901234416_kora_2026_000048_importacion_inventario_inicial.sql'), 'utf8');
const context = {};
vm.runInNewContext(source, context);
const importer = context.CreditekInventarioImport;
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

function libro(filas) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'Inventario inicial');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

test('lee celulares y accesorios, incluyendo la plantilla histórica', () => {
  const filas = importer.leerLibro(XLSX, libro([
    { 'Tienda código': 'CEL-1', Tipo: 'CELULAR', 'Referencia o producto': 'Equipo', 'IMEI o serial': '123456789', Cantidad: 1, 'Costo unitario': 10, 'Precio de tienda': 20 },
    { 'Tienda código': 'ACC-1', Tipo: 'ACC CELULAR', 'Referencia o producto': 'Cable', Cantidad: 3, 'Costo unitario': 2, 'Precio de tienda': 5 },
  ]));
  assert.equal(filas[0].tipo, 'serializado');
  assert.equal(filas[1].tipo, 'cantidad');
  assert.equal(filas[1].cantidad, 3);
});

test('rechaza códigos ambiguos antes de llamar al servidor', () => {
  assert.throws(() => importer.leerLibro(XLSX, libro([
    { 'Código de producto': 'REP-1', Tipo: 'VARIEDADES', 'Referencia o producto': 'Uno', Cantidad: 1, 'Costo unitario': 2, 'Precio de tienda': 5 },
    { 'Código de producto': 'REP-1', Tipo: 'VARIEDADES', 'Referencia o producto': 'Dos', Cantidad: 1, 'Costo unitario': 2, 'Precio de tienda': 5 },
  ])), /asignado a productos diferentes/);
});

test('la importación es central, atómica, auditada y muestra nombres de tienda', () => {
  assert.match(html, /Subir plantilla Excel/);
  assert.match(html, /inventario_importar_inicial_excel/);
  assert.match(html, /escapeHtml\(t\.nombre\)\} · código/);
  assert.match(migrations, /v_perfil\.rol not in \('gerencia', 'auditoria'\)/);
  assert.match(migrations, /set search_path = public, pg_temp/);
  assert.match(migrations, /'importacion_excel', v_referencia::text, auth\.uid\(\)/);
  assert.match(migrations, /set nombre = 'Movil Shoping Corozal'/);
  assert.match(migrations, /revoke all on function public\.inventario_importar_inicial_excel/);
});

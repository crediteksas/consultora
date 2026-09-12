import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../../creditek/erp/inventario.html', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../../supabase/migrations/20260912144724_retirar_carga_inicial_tiendas.sql', import.meta.url), 'utf8');
test('no quedan accesos a carga inicial, importación ni finalización', () => {
  assert.doesNotMatch(html, /id="(?:btnDescargarPlantilla|btnCargarInventarioInicial|btnImportarInventarioExcel|btnFinalizarCargaInicial|modalImportarInventario)"/);
  assert.doesNotMatch(html, /inventario_(?:cargar_inicial|importar_inicial_excel|finalizar_carga_inicial)/);
  assert.match(html, /Informe de movimientos por fecha/);
});
test('el retiro revoca las tres operaciones sin modificar registros existentes', () => {
  assert.equal((sql.match(/revoke execute on function/g) || []).length, 3);
  assert.equal((sql.match(/from public, anon, authenticated, service_role/g) || []).length, 3);
  assert.doesNotMatch(sql, /\b(?:delete|truncate|update|drop)\b/i);
});

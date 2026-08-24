import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const html = await readFile(path.join(root, 'creditek/erp/inventario.html'), 'utf8');
const sql = await readFile(path.join(root, 'creditek/erp/migrations/20260824_kora_2026_000038_ajustes_inventario.sql'), 'utf8');

test('los controles sensibles se crean únicamente después de esCentral', () => {
  const markupInicial = html.slice(0, html.lastIndexOf('<script>'));
  assert.doesNotMatch(markupInicial, /id="btnAjustarInventario"/);
  assert.doesNotMatch(markupInicial, /id="btnCargarInventarioInicial"/);
  assert.match(html, /if \(!esCentral\(\) \|\| document\.getElementById\('btnAjustarInventario'\)\) return/);
  assert.match(html, /crearControlesInventarioCentral\(\)/);
});

test('la UI invoca ambos RPC y refresca las dos fuentes de inventario', () => {
  assert.match(html, /inventario_registrar_ajuste/);
  assert.match(html, /inventario_cargar_inicial/);
  assert.match(html, /p_precio_tienda/);
  assert.match(html, /Promise\.all\(\[cargarCelulares\(\), cargarAccesorios\(\)\]\)/);
});

test('los RPC restringen roles, motivo y Bodega Central', () => {
  assert.match(sql, /v_perfil\.rol not in \('gerencia', 'auditoria'\)/);
  assert.match(sql, /length\(btrim\(coalesce\(p_motivo, ''\)\)\) < 5/g);
  assert.equal((sql.match(/Ajustes de Bodega Central no están soportados todavía/g) || []).length, 3);
  assert.match(sql, /revoke all on function public\.inventario_registrar_ajuste[\s\S]+from public, anon/);
  assert.match(sql, /grant execute on function public\.inventario_cargar_inicial[\s\S]+to authenticated/);
});

test('Kardex solo recibe INSERT y conserva auditoría y referencia', () => {
  assert.doesNotMatch(sql, /update public\.movimientos|delete from public\.movimientos/i);
  assert.match(sql, /'ajuste_manual', v_referencia::text, auth\.uid\(\), btrim\(p_motivo\)/);
  assert.match(sql, /'carga_inicial', v_referencia::text,[\s\S]+auth\.uid\(\), btrim\(p_motivo\)/);
  assert.match(sql, /'ajuste_entrada', 'ajuste_salida'/);
});

test('la carga serializada exige IMEIs reales y costo/precio separados', () => {
  assert.match(sql, /p_costo numeric,[\s\n]+p_precio_tienda numeric/);
  assert.match(sql, /Uno o más IMEIs ya existen en inventario/);
  assert.match(sql, /p_costo, p_precio_tienda/);
  assert.match(sql, /'disponible', p_tienda_codigo, p_costo, p_precio_tienda/);
});

test('el ajuste serializado exige estado o tienda y admite costo auditado', () => {
  assert.match(sql, /p_estado text default null/);
  assert.match(sql, /p_tienda_destino text default null/);
  assert.match(sql, /p_estado is null and p_tienda_destino is null/);
  assert.match(sql, /Nada que ajustar: indica estado o tienda destino/);
  assert.match(sql, /'garantia_proveedor', 'en_oscar', 'anulado_reingreso'/);
});

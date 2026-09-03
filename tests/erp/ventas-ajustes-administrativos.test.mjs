import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations/20260903204915_proteger_ventas_y_anulacion_administrativa.sql','utf8');
const html = fs.readFileSync('creditek/erp/ventas.html','utf8');

test('ventas confirmadas y líneas quedan protegidas contra edición o borrado directo', () => {
  assert.match(sql,/ventas_confirmadas_inmutables/);
  assert.match(sql,/venta_items_confirmados_inmutables/);
  assert.match(sql,/Registro de venta inmutable/);
});

test('solo Gerencia y Auditoría ejecutan correcciones y anulaciones', () => {
  assert.match(sql,/rol_actual\(\)\) not in \('gerencia','auditoria'\)/);
  assert.match(sql,/corregir_venta_administrativa/);
  assert.match(sql,/anular_venta_administrativa/);
});

test('la anulación restituye inventario y crea contramovimiento trazable', () => {
  assert.match(sql,/set estado='disponible'/);
  assert.match(sql,/cantidad=public\.stock_cantidad\.cantidad\+excluded\.cantidad/);
  assert.match(sql,/values\('ajuste_entrada'/);
  assert.match(sql,/reverso_de/);
});

test('cada ajuste conserva antes, después, responsable y motivo', () => {
  assert.match(sql,/valores_anteriores jsonb not null/);
  assert.match(sql,/valores_nuevos jsonb not null/);
  assert.match(sql,/usuario_id uuid not null/);
  assert.match(sql,/length\(btrim\(motivo\)\) >= 10/);
});

test('Ventas ofrece a perfiles centrales corregir o anular con trazabilidad', () => {
  assert.match(html,/id="btnGestionarVenta"/);
  assert.match(html,/id="modalAjusteVenta"/);
  assert.match(html,/function puedeAjustarVentas\(\)/);
  assert.match(html,/anular_venta_administrativa/);
  assert.match(html,/corregir_venta_administrativa/);
  assert.match(html,/venta_ajustes_administrativos/);
});

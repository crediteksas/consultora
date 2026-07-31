import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const migrationUrl = new URL('../../creditek/erp/migrations/20260731_kora_2026_000017_costo_promedio_tienda.sql', import.meta.url);
const correctiveMigrationUrl = new URL('../../creditek/erp/migrations/20260731_kora_2026_000017_solo_no_serializados.sql', import.meta.url);
const domainUrl = new URL('../../creditek/erp/inventario-costo-domain.js', import.meta.url);

async function source(url) {
  return readFile(url, 'utf8');
}

test('pondera compras consecutivas y mantiene costos independientes por tienda', async () => {
  const context = { window: {} };
  vm.runInNewContext(await source(domainUrl), context);
  const { calcularPromedioPonderado } = context.window.CreditekInventarioCosto;

  const promedio = (stockAnterior, costoAnterior, cantidadEntrada, costoEntrada) =>
    Math.round(calcularPromedioPonderado({ stockAnterior, costoAnterior, cantidadEntrada, costoEntrada }) * 100) / 100;
  assert.equal(promedio(0, 0, 5, 1200), 1200);
  assert.equal(promedio(10, 1000, 5, 1200), 1066.67);
  assert.equal(promedio(15, 1066.67, 5, 1300), 1125);

  const tiendaA = promedio(10, 1000, 5, 1200);
  const tiendaB = promedio(4, 1800, 2, 2100);
  assert.equal(tiendaA, 1066.67);
  assert.equal(tiendaB, 1900);
});

test('la migracion pondera solo entradas de remision y traslado en la tienda destino', async () => {
  const sql = await source(migrationUrl);

  assert.match(sql, /create or replace function public\.aplicar_costo_promedio_tienda/i);
  assert.match(sql, /p_tienda_codigo[\s\S]*p_producto_id[\s\S]*p_cantidad_entrada[\s\S]*p_costo_tienda_entrada/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /precio_tienda[\s\S]*existencias_anteriores[\s\S]*p_costo_tienda_entrada/i);
  assert.match(sql, /'remision'[\s\S]*v_remision\.id::text/i);
  assert.match(sql, /'traslado'[\s\S]*p_traslado_id::text/i);
  assert.doesNotMatch(sql, /create or replace function public\.ejecutar_traslado_despacho/i);
});

test('la correccion excluye serializados sin tocar ventas ni movimientos historicos', async () => {
  const sql = await source(correctiveMigrationUrl);

  assert.match(sql, /El costo promedio solo aplica a productos no serializados/i);
  assert.match(sql, /p_tipo_inventario\s*<>\s*'cantidad'/i);
  assert.match(sql, /confirmar_recepcion_remision\(uuid,jsonb\)/i);
  assert.match(sql, /ejecutar_traslado_recepcion\(uuid\)/i);
  const replacementBodies = [...sql.matchAll(/\$new\$([\s\S]*?)\$new\$/gi)].map(match => match[1]).join('\n');
  assert.doesNotMatch(replacementBodies, /aplicar_costo_promedio_tienda/i);
  assert.doesNotMatch(replacementBodies, /set precio_tienda = v_costo_nuevo/i);
  assert.doesNotMatch(sql, /update public\.venta_items/i);
  assert.doesNotMatch(sql, /update public\.movimientos/i);
});

test('la venta posterior conserva el costo promedio vigente como snapshot', async () => {
  const utilidad = await source(new URL('../../creditek/erp/migrations/20260727_utilidad_tienda_costo_remision.sql', import.meta.url));

  assert.match(utilidad, /select\s+u\.precio_tienda/i);
  assert.match(utilidad, /where u\.id = new\.unidad_id/i);
  assert.match(utilidad, /select\s+sc\.precio_tienda/i);
  assert.match(utilidad, /new\.costo_remision_congelado\s*:=\s*v_costo_remision/i);
});

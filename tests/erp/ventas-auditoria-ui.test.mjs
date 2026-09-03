import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ventas = readFileSync(new URL('../../creditek/erp/ventas.html', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../../creditek/erp/sidebar.js', import.meta.url), 'utf8');

test('Ventas abre con rango del mes vigente y resumen operativo', () => {
  assert.match(ventas, /id="filtroDesde"/);
  assert.match(ventas, /id="filtroHasta"/);
  assert.match(ventas, /fechaHoy\.slice\(0, 7\) \+ '-01'/);
  assert.match(ventas, /\.gte\('fecha', desde\)/);
  assert.match(ventas, /\.lte\('fecha', hasta\)/);
  assert.match(ventas, /id="resumenCantidad"/);
  assert.match(ventas, /id="resumenContado"/);
  assert.match(ventas, /id="resumenCredito"/);
});

test('Ventas y el selector global excluyen clientes B2B del catálogo Retail', () => {
  const exclusion = /\.not\('codigo', 'in', '\(CK-12,CK-13,CK-14\)'\)/;
  assert.match(ventas, exclusion);
  assert.match(sidebar, /new Set\(\['CK-12', 'CK-13', 'CK-14'\]\)/);
  assert.match(sidebar, /filter\(tienda => !codigosClientesB2B\.has\(tienda\.codigo\)\)/);
});

test('el detalle acepta identificadores numéricos y conserva trazabilidad', () => {
  assert.match(ventas, /String\(m\.id\)\.toUpperCase\(\)/);
  assert.match(ventas, /String\(ventaSeleccionada\.id\)\.toUpperCase\(\)/);
  assert.doesNotMatch(ventas, /escapeHtml\(m\.id\.toUpperCase\(\)\)/);
});

test('la tabla se transforma en fichas legibles en pantallas estrechas', () => {
  assert.match(ventas, /id="tablaVentas"/);
  assert.match(ventas, /#tablaVentas td::before/);
  assert.match(ventas, /data-label="Tienda"/);
  assert.match(ventas, /data-label="Vendedor"/);
});

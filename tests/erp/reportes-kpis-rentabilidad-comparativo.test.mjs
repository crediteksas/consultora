import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../creditek/erp/reportes.html', import.meta.url), 'utf8');

test('Retail muestra rentabilidad, gastos y créditos por plataforma sin alterar movimientos', () => {
  assert.match(html, /id="kpi-margen"/);
  assert.match(html, /id="kpi-utilidad"/);
  assert.match(html, /id="kpi-gastos-venta"/);
  assert.match(html, /id="kpi-creditos"/);
  assert.match(html, /Venta menos costo congelado/);
  assert.match(html, /Margen menos gastos aprobados/);
  assert.match(html, /\.eq\('estado', 'aprobado'\)/);
  assert.match(html, /sb\.from\('creditos'\).*ventas!inner/s);
});

test('Retail compara los KPI soportados contra el histórico 2025', () => {
  assert.match(html, /Comparativo operativo frente a 2025/);
  assert.match(html, /cel_uds, acc_uds, utilidad_bruta/);
  assert.match(html, /utilidad_neta_dia/);
  assert.match(html, /\['Unidades vendidas', unidades, ref2025\.unidades/);
  assert.match(html, /\['Utilidad operativa', utilidad, ref2025\.utilidad/);
});

test('cumplimiento usa la meta de venta y no cruza ventas contra meta de utilidad', () => {
  assert.match(html, /Meta de venta/);
  assert.match(html, /const meta = Number\(p\.meta_venta_total \|\| 0\)/);
  assert.doesNotMatch(html, /const meta = Number\(p\.meta_utilidad \|\| 0\)/);
  assert.match(html, /presupuestoPorTienda/);
  assert.match(html, /\.gte\('fecha', mesActual\)\.lt\('fecha', finMesActual\)/);
});

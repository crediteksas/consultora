import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => readFile(path.join(root, relative), 'utf8');

const dashboardIds = [
  'fechaHoy',
  'filtroPeriodo',
  'campoRangoDesde',
  'rangoDesde',
  'campoRangoHasta',
  'rangoHasta',
  'filtroTienda',
  'kpiVentas',
  'kpiVentasVar',
  'kpiCreditos',
  'kpiCreditosVar',
  'kpiUtilidad',
  'kpiUtilidadVar',
  'kpiPendientes',
  'tbodyTiendas',
  'tfootTotal',
  'emptyTiendas',
  'listaAlertas',
  'chartCreditos',
  'chartUtilidad',
  'tbodyEjecutivos',
  'emptyEjecutivos',
];

test('el Dashboard KORA conserva su contrato funcional y usa una capa visual propia', async () => {
  const source = await read('creditek/erp/tablero.html');

  assert.match(source, /\/design-system\/components\/kora-dashboard\.css/);
  assert.match(source, /data-kora-dashboard="1\.0\.0"/);
  dashboardIds.forEach(id => assert.match(source, new RegExp(`id="${id}"`), id));

  [
    "addEventListener('change', onCambioFiltro)",
    "addEventListener('change', actualizarPeriodo)",
    'cargarKPIs(); cargarTiendas_Tabla();',
    "sb.from('ventas')",
    "allRows(sb,'presupuestos'",
    "sb.from('caja_diaria')",
    "sb.from('solicitudes')",
    "sb.from('stock_cantidad_lectura')",
    "sb.from('creditos')",
    "sb.from('abonos')",
  ].forEach(contract => assert.ok(source.includes(contract), contract));
  const utility = await read('creditek/erp/tablero-utilidad.js');
  assert.match(utility, /allRows\(sb,'venta_items_lectura'/);
  assert.match(source, /CreditekTableroUtilidad\.retailData/);
});

test('cada cambio de fechas o tienda refresca indicadores, detalle y utilidad', async () => {
  const source = await read('creditek/erp/tablero.html');
  for (const id of ['rangoDesde', 'rangoHasta', 'filtroTienda']) {
    assert.ok(source.includes(`getElementById('${id}').addEventListener('change', actualizarPeriodo)`));
  }
  const refresh = source.match(/function actualizarPeriodo\(\) \{[^}]*\}/)?.[0];
  assert.ok(refresh);
  const calls = [];
  const context = {
    cargarKPIs: () => calls.push('indicadores'),
    cargarTiendas_Tabla: () => calls.push('tiendas'),
    actualizarUtilidad: () => calls.push('utilidad'),
  };
  vm.runInNewContext(refresh, context);
  context.actualizarPeriodo();
  assert.deepEqual(calls, ['indicadores', 'tiendas', 'utilidad']);
});

test('la presentación del Dashboard depende de tokens y no introduce estilos inline', async () => {
  const [source, css] = await Promise.all([
    read('creditek/erp/tablero.html'),
    read('design-system/components/kora-dashboard.css'),
  ]);

  assert.doesNotMatch(source, /<style\b/i);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/gi);
  assert.doesNotMatch(css, /\brgba?\(/gi);
  assert.match(css, /@import url\("\.\.\/styles\/index\.css"\)/);
  assert.match(css, /var\(--ctk-/);
  for (const className of ['dashboard-document-access', 'store-profit-detail', 'dashboard-month-close__grid']) {
    assert.ok(css.includes(`.${className}`), className);
  }
  assert.match(css, /\.dashboard-document-access:hover[^}]*var\(--ctk-shadow-2\)/);
});

test('el Dashboard tiene jerarquía SaaS, iconografía Lucide y responsive propio', async () => {
  const [source, css] = await Promise.all([
    read('creditek/erp/tablero.html'),
    read('design-system/components/kora-dashboard.css'),
  ]);

  [
    'dashboard-hero',
    'dashboard-filterbar',
    'dashboard-metrics',
    'dashboard-primary-grid',
    'dashboard-support-grid',
    'dashboard-table',
  ].forEach(className => assert.match(source, new RegExp(`class="[^"]*${className}`), className));
  assert.match(source, /data-lucide=/);
  assert.doesNotMatch(source, /[💰💳📈✅🔴🟡⚪⚠️]/u);
  assert.match(css, /@media \(max-width: 63\.999rem\)/);
  assert.match(css, /@media \(max-width: 47\.999rem\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible/);
});

test('el Dashboard controla densidad real, carga y tablas anchas sin perder datos', async () => {
  const [source, css] = await Promise.all([
    read('creditek/erp/tablero.html'),
    read('design-system/components/kora-dashboard.css'),
  ]);

  assert.match(source, /class="dashboard-loading-state" role="status"/);
  assert.match(source, /class="tabla-wrap" tabindex="0" role="region"/);
  assert.match(source, /indexAxis:\s*'y'/);
  assert.match(css, /\.dashboard-alerts-panel \.alertas-lista\s*\{[^}]*max-height:/s);
  assert.match(css, /\.dashboard-alerts-panel \.alertas-lista\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /@media \(max-width: 47\.999rem\)[\s\S]*\.dashboard-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(2,/);
  assert.doesNotMatch(css, /body\[data-kora-dashboard="1\.0\.0"\]\s+\.kora-topbar/);
  assert.doesNotMatch(css, /body\[data-kora-dashboard="1\.0\.0"\]\s+\.kora-sidebar/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

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
    "addEventListener('change', cargarKPIs)",
    'cargarKPIs(); cargarTiendas_Tabla();',
    "sb.from('ventas')",
    "sb.from('venta_items')",
    "sb.from('presupuestos')",
    "sb.from('caja_diaria')",
    "sb.from('solicitudes')",
    "sb.from('stock_cantidad')",
    "sb.from('creditos')",
    "sb.from('abonos')",
  ].forEach(contract => assert.ok(source.includes(contract), contract));
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

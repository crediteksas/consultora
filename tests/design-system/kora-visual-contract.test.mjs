import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = file => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
const source = await read('creditek/erp/kora-responsive.js');
const css = await read('design-system/components/kora-responsive.css');
const classification = source.slice(source.indexOf('  function cleanLabel'), source.indexOf('  function alignColumns'));
const context = vm.createContext({});
vm.runInContext(classification, context);

test('cabeceras y valores usan ejes consistentes sin alterar su contenido', () => {
  for (const label of ['Estado', 'Acciones', 'Cantidad', 'Créditos / meta', 'PayJoy', 'Aliadas activas']) {
    assert.equal(context.columnAlignment(label), 'center', label);
  }
  for (const label of ['Saldo inicial', 'Costo unit.', 'Comisión registrada', 'Valor', 'Utilidad', 'Margen %', 'Financiado', 'Iniciales', 'Gastos', 'Salidas explícitas', 'Esperado actualizado', 'Diferencia al cerrar']) {
    assert.equal(context.columnAlignment(label), 'right', label);
  }
  for (const label of ['Tienda', 'Proveedor / NIT', 'Concepto', 'Beneficiario', 'Fecha']) {
    assert.equal(context.columnAlignment(label), 'left', label);
  }
  assert.match(source, /row\.cells\.length !== headers\.length/);
  assert.match(source, /cell\.colSpan > 1 \|\| cell\.rowSpan > 1/);
  assert.match(css, /table\.kora-responsive-cards :is\(tbody, tfoot\) td\[data-kora-align\][\s\S]*?text-align: left !important/);
});

test('interacciones visibles respetan estado deshabilitado y movimiento reducido', () => {
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(css, /:hover:not\(:disabled\):not\(\[aria-disabled="true"\]\)/);
  assert.match(css, /transform: translateY\(-2px\)/);
  assert.match(css, /transform: translateY\(1px\) scale\(\.985\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition: none/);
  assert.match(css, /\.dashboard-panel, \.form-card, section\.bg-white, \.kpi-card, \.metric, \.resumen-card, \.stat\)[\s\S]*?border-top: 2px solid var\(--ctk-color-secondary-500\)/);
});

test('inventario reserva ancho para los importes y conserva contraste en enlaces botón', async () => {
  const html = await read('creditek/erp/inventario.html');
  assert.match(html, /minmax\(min\(100%, 270px\), 1fr\)/);
  assert.match(html, /a\.btn-export[^}]*color:#fff;[^}]*text-decoration:none/);
  assert.match(html, /font-size:clamp\(1\.5rem,2vw,1\.75rem\)/);
});

test('filtros conservan etiquetas nativas y métricas forman filas equilibradas', async () => {
  const js = await read('design-system/components/kora-product.js');
  assert.match(js, /if \(control\.closest\('label'\)\) return;/);
  assert.match(css, /label:not\(:has\(input\[type="checkbox"\], input\[type="radio"\]\)\)/);
  assert.match(css, /\[data-aliados-view="bonuses"\]\) \.metrics\s*\{\s*grid-template-columns: repeat\(3/);
  assert.match(css, /\[data-aliados-view="budget"\] \.metrics\s*\{\s*grid-template-columns: repeat\(4/);
});

test('las pantallas del shell cargan el mismo diseño y separan contenido de navegación', async () => {
  const { readdir } = await import('node:fs/promises');
  for (const name of (await readdir(new URL('../../creditek/erp/', import.meta.url))).filter(name => name.endsWith('.html'))) {
    const html = await read(`creditek/erp/${name}`);
    if (!html.includes('sidebar.js')) continue;
    assert.ok(html.includes('/design-system/components/kora-product.css'), name);
    assert.ok(html.includes('/design-system/components/kora-product.js'), name);
  }
  const shell = await read('creditek/erp/sidebar.js');
  assert.match(shell, /root\.classList\.remove\('main-content'\)/);
  assert.match(shell, /content\.classList\.add\('main-content'\)/);
  assert.match(css, /td\[data-kora-align="center"\] > :is\(\.row-actions, \.actions\) \{ justify-content: center/);
  assert.match(css, /:is\(\.active, \.activo, \[aria-selected="true"\]\)/);
});

test('el título de navegación distingue las vistas general y retail de gastos', async () => {
  const shell = await read('creditek/erp/sidebar.js');
  const fn = shell.slice(shell.indexOf('  function koraCurrentItem'), shell.indexOf('  function modulesForProfile'));
  const ctx = vm.createContext({ paginaActual: () => 'finanzas-programadas.html', window: { location: { search: '?vista=general', hash: '' } } });
  vm.runInContext(fn, ctx);
  const modules = [{ titulo: 'Retail', items: [{ label: 'Gastos periódicos', href: 'finanzas-programadas.html?vista=retail' }] }, { titulo: 'Administración', items: [{ label: 'Gastos y retiros', href: 'finanzas-programadas.html?vista=general' }] }];
  assert.equal(ctx.koraCurrentItem(modules).label, 'Gastos y retiros');
  ctx.window.location.search = '?vista=retail';
  assert.equal(ctx.koraCurrentItem(modules).label, 'Gastos periódicos');
});

test('las páginas incorporadas conservan separación lateral y título del documento', async () => {
  for (const name of ['pedidos-b2b', 'bodega-central', 'reportes', 'compra-proveedor']) {
    assert.match(await read(`creditek/erp/${name}.html`), /class="page kora-page-inset/);
  }
  assert.match(css, /\.page\.kora-page-inset \{ padding: 24px; \}/);
  assert.match(css, /\.page\.kora-page-inset \{ padding: 16px 12px; \}/);
  const shell = await read('creditek/erp/sidebar.js');
  const fn = shell.slice(shell.indexOf('  function koraCurrentItem'), shell.indexOf('  function modulesForProfile'));
  const ctx = vm.createContext({ paginaActual: () => 'documento-remision.html', document: { querySelector: () => null }, window: { location: { search: '?remision_id=test', hash: '' } } });
  vm.runInContext(fn, ctx);
  assert.equal(ctx.koraCurrentItem([]).label, 'Remisión');
});

test('los formularios y reportes operativos conservan el ámbito del diseño compartido', async () => {
  for (const name of ['compra-proveedor', 'proveedores', 'utilidad-creditek', 'bodega-central', 'pedidos-b2b']) {
    assert.match(await read(`creditek/erp/${name}.html`), /class="[^"]*main-content/);
  }
});

test('B2B usa un encabezado de contenido sin duplicar la barra de navegación', async () => {
  const html = await read('creditek/erp/utilidad-creditek.html');
  assert.doesNotMatch(html, /<header class="topbar">/);
  assert.match(html, /<header class="page-head">/);
  for (const id of ['btn-refresh', 'ultima-actualizacion', 'usuario-info']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
  }
});

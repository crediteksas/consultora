import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => readFile(path.join(root, relative), 'utf8');

test('la navegación distingue resumen ejecutivo, análisis e incidencias sin cambiar rutas', async () => {
  const source = await read('creditek/erp/sidebar.js');

  assert.match(source, /label: 'Resumen ejecutivo', href: 'tablero\.html', lucide: 'gauge'/);
  assert.match(source, /label: 'Análisis e informes', href: 'reportes\.html'/);
  assert.match(source, /label: 'Mis incidencias', href: 'mis-reportes\.html'/);
  assert.doesNotMatch(source, /label: 'Dashboard', href: '(?:tablero|reportes)\.html'/);
});

test('cada opción operativa repetitiva tiene icono y descripción semánticos', async () => {
  const source = await read('creditek/erp/sidebar.js');
  const contracts = [
    ['Ventas', 'shopping-cart'],
    ['Gastos', 'receipt'],
    ['Cierre día', 'circle-check-big'],
    ['Cuenta cte.', 'book-open-check'],
    ['Conciliación', 'scale'],
    ['Cartera de Proveedores', 'hand-coins'],
    ['Compra proveedor', 'package-plus'],
    ['Bodega Central', 'warehouse'],
    ['Utilidad Creditek', 'chart-no-axes-column-increasing'],
    ['Registrar cliente', 'user-plus'],
    ['Validación', 'badge-check'],
  ];

  for (const [label, icon] of contracts) {
    assert.match(
      source,
      new RegExp(`label: '${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'[^\\n]*lucide: '${icon}'`),
      `${label} debe usar ${icon}`,
    );
  }
  assert.match(source, /description: 'Resumen en tiempo real/);
  assert.match(source, /description: 'Informes históricos/);
});

test('el shell usa un solo control adaptable para navegación', async () => {
  const source = await read('creditek/erp/sidebar.js');

  assert.match(source, /class="kora-icon-button kora-navigation-toggle ghost"/);
  assert.doesNotMatch(source, /class="kora-icon-button kora-mobile-menu ghost"/);
  assert.doesNotMatch(source, /querySelector\('\.kora-mobile-menu'\)/);
  assert.match(source, /matchMedia\('\(max-width: 63\.999rem\)'\)/);
});

test('los tooltips globales aparecen tras 2.5 segundos y no dependen de title nativo', async () => {
  const [source, css] = await Promise.all([
    read('creditek/erp/sidebar.js'),
    read('design-system/components/kora-shell.css'),
  ]);

  assert.match(source, /const KORA_TOOLTIP_DELAY_MS = 2_500/);
  assert.match(source, /data-kora-tooltip=/);
  assert.match(source, /role', 'tooltip'/);
  assert.match(source, /setTimeout\([^]*KORA_TOOLTIP_DELAY_MS/);
  assert.match(css, /\.kora-delayed-tooltip/);
  assert.match(
    css,
    /\.kora-delayed-tooltip\s*\{[^}]*color:\s*var\(--ctk-color-neutral-0\)/s,
  );
  assert.match(
    css,
    /\.kora-delayed-tooltip\s*\{[^}]*padding:\s*var\(--ctk-space-1\)/s,
  );
  assert.doesNotMatch(css, /--ctk-color-text-inverse|--ctk-space-1-5/);
});

test('breadcrumbs reservan espacio y condensan niveles intermedios sin superponerse', async () => {
  const css = await read('design-system/components/kora-shell.css');

  assert.match(css, /\.kora-topbar__context\s*\{[^}]*flex:/s);
  assert.match(css, /\.kora-breadcrumb\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.kora-breadcrumb li\s*\{[^}]*text-overflow:\s*ellipsis/s);
  assert.match(css, /@media \(max-width: 79\.999rem\)[^]*\.kora-breadcrumb li:not\(:first-child\):not\(:last-child\)/);
});

test('el build invalida la caché del shell y la marca corregidos', async () => {
  const [source, build] = await Promise.all([
    read('creditek/erp/sidebar.js'),
    read('scripts/build-public.mjs'),
  ]);

  assert.match(source, /kora-shell\.css\?v=2\.0\.4/);
  assert.match(build, /KORA_SHELL_ASSET_VERSION = '2\.0\.5'/);
  assert.match(build, /KORA_PRODUCT_ASSET_VERSION = '2\.0\.4'/);
});

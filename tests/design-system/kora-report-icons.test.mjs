import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const productJs = fs.readFileSync(
  new URL('../../design-system/components/kora-product.js', import.meta.url),
  'utf8',
);
const reportsHtml = fs.readFileSync(
  new URL('../../creditek/erp/reportes.html', import.meta.url),
  'utf8',
);
const buildScript = fs.readFileSync(
  new URL('../../scripts/build-public.mjs', import.meta.url),
  'utf8',
);
const sidebarJs = fs.readFileSync(
  new URL('../../creditek/erp/sidebar.js', import.meta.url),
  'utf8',
);

test('Análisis e informes conserva títulos semánticos distintos', () => {
  const expectedTitles = [
    'Cuadro de ventas por tienda',
    'Cartera pendiente por tienda',
    'Inventario valorizado por tienda',
    'Cumplimiento de presupuesto',
    'Rentabilidad por tienda',
    'Rentabilidad por categoría',
    'Utilidad Creditek',
    'Crecimiento mes a mes',
    'Top productos y slow movers',
  ];

  expectedTitles.forEach(title => assert.match(reportsHtml, new RegExp(title)));
});

test('el adaptador asigna iconos específicos a cada informe y no usa el fallback', () => {
  const semanticContracts = [
    ["/cuadro de ventas/.test(value)", "return 'shopping-cart'"],
    ["/cartera pendiente/.test(value)", "return 'hand-coins'"],
    ["/inventario valorizado/.test(value)", "return 'package-search'"],
    ["/cumplimiento de presupuesto/.test(value)", "return 'target'"],
    ["/rentabilidad por tienda/.test(value)", "return 'store'"],
    ["/rentabilidad por categoría/.test(value)", "return 'tags'"],
    ["/utilidad creditek/.test(value)", "return 'chart-no-axes-column-increasing'"],
    ["/crecimiento mes a mes/.test(value)", "return 'trending-up'"],
    ["/top productos|slow movers/.test(value)", "return 'trophy'"],
  ];

  semanticContracts.forEach(([condition, result]) => {
    assert.ok(
      productJs.includes(`if (${condition}) ${result};`),
      `falta el contrato ${condition} → ${result}`,
    );
  });
});

test('las reglas específicas aparecen antes de las categorías genéricas', () => {
  const specific = productJs.indexOf("return 'shopping-cart'");
  const generic = productJs.indexOf("return 'wallet'");

  assert.ok(specific >= 0, 'debe existir la regla específica de ventas');
  assert.ok(generic > specific, 'las reglas específicas deben evaluarse antes del fallback financiero');
});

test('el build invalida la caché del adaptador visual actualizado', () => {
  assert.match(buildScript, /const KORA_PRODUCT_ASSET_VERSION = '2\.0\.4'/);
  assert.match(buildScript, /const KORA_SHELL_ASSET_VERSION = '2\.0\.8'/);
  assert.match(buildScript, /kora-product\\\.js/);
  assert.match(buildScript, /KORA_PRODUCT_ASSET_VERSION/);
});

test('cada sección principal explica su propósito mediante tooltip tardío', () => {
  const groups = [
    'TABLERO',
    'ANÁLISIS',
    'INVENTARIO',
    'CAJA',
    'BODEGA CENTRAL',
    'CLIENTES',
    'ADMINISTRACIÓN',
  ];

  groups.forEach(group => {
    assert.match(
      sidebarJs,
      new RegExp(`titulo: '${group}',[^\\n]*description: '[^']+'`),
      `${group} necesita una explicación`,
    );
  });
  assert.match(
    sidebarJs,
    /data-kora-tooltip="\$\{escapeHtml\(module\.description\)\}"/,
  );
});

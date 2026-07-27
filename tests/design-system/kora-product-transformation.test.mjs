import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const surfaces = [
  'creditek/erp/app.html',
  'creditek/erp/cambiar-clave.html',
  'creditek/erp/registro.html',
  'creditek/erp/validacion.html',
  'creditek/erp/tablero.html',
  'creditek/erp/presupuestos.html',
  'creditek/erp/catalogo.html',
  'creditek/erp/inventario.html',
  'creditek/erp/remisiones.html',
  'creditek/erp/documento-remision.html',
  'creditek/erp/traslados.html',
  'creditek/erp/ajustes.html',
  'creditek/erp/kardex.html',
  'creditek/erp/cierre-periodo.html',
  'creditek/erp/auditoria-cruzada.html',
  'creditek/erp/ventas.html',
  'creditek/erp/gastos.html',
  'creditek/erp/caja.html',
  'creditek/erp/cuenta-corriente.html',
  'creditek/erp/conciliacion.html',
  'creditek/erp/bodega-central.html',
  'creditek/erp/compra-proveedor.html',
  'creditek/erp/proveedores.html',
  'creditek/erp/utilidad-creditek.html',
  'creditek/erp/reportes.html',
  'creditek/agentes/index.html',
  'creditek/agentes/creditek-agente-redes.html',
  'creditek/agentes/creditek-agente-respuestas.html',
  'creditek/agentes/agente3-meta-ads.html',
  'creditek/agentes/creditek-agente-calendario.html',
  'creditek/agentes/creditek-gbp-fichas.html',
  'creditek/portal/index.html',
  'creditek/convenios/index.html',
  'creditek/legal/index.html',
];

const authenticatedErp = [
  'creditek/erp/app.html',
  'creditek/erp/validacion.html',
  'creditek/erp/tablero.html',
  'creditek/erp/presupuestos.html',
  'creditek/erp/catalogo.html',
  'creditek/erp/inventario.html',
  'creditek/erp/remisiones.html',
  'creditek/erp/documento-remision.html',
  'creditek/erp/traslados.html',
  'creditek/erp/ajustes.html',
  'creditek/erp/kardex.html',
  'creditek/erp/cierre-periodo.html',
  'creditek/erp/auditoria-cruzada.html',
  'creditek/erp/ventas.html',
  'creditek/erp/gastos.html',
  'creditek/erp/caja.html',
  'creditek/erp/cuenta-corriente.html',
  'creditek/erp/conciliacion.html',
  'creditek/erp/bodega-central.html',
  'creditek/erp/compra-proveedor.html',
  'creditek/erp/proveedores.html',
  'creditek/erp/utilidad-creditek.html',
  'creditek/erp/reportes.html',
];

test('todas las superficies públicas de KORA consumen la transformación compartida', async () => {
  for (const path of surfaces) {
    const source = await read(path);
    assert.match(
      source,
      /<link rel="stylesheet" href="\/design-system\/components\/kora-product\.css">/,
      `${path} no carga kora-product.css`,
    );
    assert.match(
      source,
      /<script src="\/design-system\/components\/kora-product\.js" defer><\/script>/,
      `${path} no carga kora-product.js`,
    );
  }
});

test('todas las pantallas ERP autenticadas consumen una única navegación KORA', async () => {
  for (const path of authenticatedErp) {
    const source = await read(path);
    assert.match(
      source,
      /<script src="sidebar\.js" data-kora-shell="1\.0\.0"><\/script>/,
      `${path} no activa el shell compartido`,
    );
  }
});

test('la capa visual compartida usa tokens y cubre controles, datos, estados y responsive', async () => {
  const css = await read('design-system/components/kora-product.css');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  for (const contract of [
    '[data-kora-product]',
    '.kora-product-page',
    '.kora-table-region',
    ':focus-visible',
    'prefers-reduced-motion',
    '@media (max-width: 63.999rem)',
    '@media (max-width: 47.999rem)',
    'dialog',
    'table',
    'input',
    'button',
    'creditek-shell-authenticated',
  ]) {
    assert.match(css, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(css, /@media \(max-width: 47\.999rem\)[\s\S]*\.header-right\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.kora-product-page\s*\{[^}]*overflow-x:\s*hidden/s);
  assert.match(css, /\.kora-product-page #login-screen\s*\{[^}]*background:\s*var\(--ctk-color-background\)/s);
});

test('el adaptador visual no contiene consultas ni altera contratos de negocio', async () => {
  const source = await read('design-system/components/kora-product.js');
  assert.match(source, /dataset\.koraProduct = '1\.0\.0'/);
  assert.match(source, /classList\.add\('kora-product-page'\)/);
  assert.match(source, /classList\.add\('kora-table-region'\)/);
  assert.doesNotMatch(source, /supabase|fetch\(|XMLHttpRequest|\.from\(\s*['"]|sessionStorage/i);
  assert.match(source, /kora_ui_audio:/);
});

test('el shell revela de forma segura las pantallas que usaban la utilidad hidden', async () => {
  const source = await read('creditek/erp/sidebar.js');
  assert.match(source, /if \(appEl\.dataset\?\.koraMounted === 'true'\) return Promise\.resolve\(true\);/);
  assert.match(
    source,
    /if \(KORA_SHELL_ENABLED\) \{\s*appEl\.classList\.remove\('hidden'\);\s*mountKoraShell/s,
  );
});

test('el shell conserva el módulo activo cuando Cloudflare elimina la extensión html', async () => {
  const source = await read('creditek/erp/sidebar.js');
  assert.match(source, /const pagina = partes\[partes\.length - 1\] \|\| 'app\.html';/);
  assert.match(source, /return pagina\.includes\('\.'\) \? pagina : `\$\{pagina\}\.html`;/);
});

test('el acceso al portal de agentes identifica el producto KORA y la empresa Creditek', async () => {
  const [source, brand] = await Promise.all([
    read('creditek/agentes/index.html'),
    read('design-system/components/kora-product.js'),
  ]);
  assert.match(source, /data-kora-brand data-variant="login"/);
  assert.match(brand, /KORA — Creditek/);
  assert.match(brand, /creditek_logo_corregido_alta\.png/);
});

test('la transformación visual queda versionada como KORA v1.0.0', async () => {
  const [manifestSource, changelog] = await Promise.all([
    read('design-system/components/manifest.json'),
    read('design-system/CHANGELOG.md'),
  ]);
  const manifest = JSON.parse(manifestSource);
  assert.equal(manifest.koraProductVersion, '1.0.0');
  assert.equal(manifest.productSurface.css, 'components/kora-product.css');
  assert.equal(manifest.productSurface.javascript, 'components/kora-product.js');
  assert.match(changelog, /KORA Visual Transformation v1\.0\.0/);
});

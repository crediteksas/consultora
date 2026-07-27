import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => readFile(path.join(root, relative), 'utf8');

test('versiona KORA Ecosystem Design v2.0.0', async () => {
  const [manifestSource, product, changelog] = await Promise.all([
    read('design-system/components/manifest.json'),
    read('design-system/components/kora-product.js'),
    read('design-system/CHANGELOG.md'),
  ]);
  const manifest = JSON.parse(manifestSource);
  assert.equal(manifest.koraProductVersion, '2.0.0');
  assert.equal(manifest.productSurface.name, 'KORA Ecosystem Design');
  assert.equal(manifest.productSurface.ecosystemCss, 'components/kora-ecosystem.css');
  assert.match(product, /dataset\.koraEcosystem = '2\.0\.0'/);
  assert.match(changelog, /## \[2\.0\.0\] - 2026-07-27/);
});

test('usa una paleta clara y tokens en la capa global', async () => {
  const [ecosystem, shell] = await Promise.all([
    read('design-system/components/kora-ecosystem.css'),
    read('design-system/components/kora-shell.css'),
  ]);
  assert.match(ecosystem, /background: var\(--ctk-color-neutral-50\)/);
  assert.match(shell, /\.kora-sidebar\s*\{[^}]*background: var\(--ctk-color-neutral-50\)/s);
  assert.match(shell, /data-sidebar-collapsed/);
  assert.match(shell, /\.kora-command/);
  assert.doesNotMatch(ecosystem, /#[0-9a-f]{3,8}\b/gi);
});

test('reserva Sidebar y Topbar desde el primer frame sin spinner', async () => {
  const [shell, source] = await Promise.all([
    read('design-system/components/kora-shell.css'),
    read('creditek/erp/sidebar.js'),
  ]);
  assert.match(shell, /html\.creditek-shell-pending body::before[\s\S]*width: var\(--ctk-width-sidebar\)/);
  assert.match(shell, /html\.creditek-shell-pending body::after[\s\S]*height: var\(--ctk-height-topbar\)/);
  assert.doesNotMatch(shell, /ctk-spin/);
  assert.match(source, /if \(KORA_SHELL_ENABLED\) installKoraAssets\(\)/);
  assert.ok(
    source.indexOf("const KORA_LUCIDE_URL") < source.indexOf('if (KORA_SHELL_ENABLED) installKoraAssets()'),
    'Lucide debe declararse antes de instalar los recursos del shell'
  );
  assert.match(source, /requestAnimationFrame\(\(\) => root\.dataset\.koraStable = 'true'\)/);
});

test('mantiene responsive, reducción de movimiento y tablas locales', async () => {
  const ecosystem = await read('design-system/components/kora-ecosystem.css');
  assert.match(ecosystem, /max-width: 63\.999rem/);
  assert.match(ecosystem, /max-width: 47\.999rem/);
  assert.match(ecosystem, /prefers-reduced-motion: reduce/);
  assert.match(ecosystem, /table\s*\{[\s\S]*min-width: max\(100%, 40rem\)/);
});

test('el portal de pedidos usa navegación e iconografía KORA sin emojis de interfaz', async () => {
  const [portal, ecosystem, product] = await Promise.all([
    read('creditek/portal/index.html'),
    read('design-system/components/kora-ecosystem.css'),
    read('design-system/components/kora-product.js'),
  ]);
  assert.match(portal, /data-lucide="store"/);
  assert.match(portal, /data-lucide="smartphone"/);
  assert.doesNotMatch(portal, /class="vista-btn[^"]*"[^>]*>[^<]*[🏪📋🔒]/u);
  assert.doesNotMatch(portal, /class="cat-btn-emoji">[📱🔊🔌🏠💻🛴]/u);
  assert.match(ecosystem, /Portal de pedidos: neutraliza la superficie heredada/);
  assert.match(ecosystem, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(product, /https:\/\/unpkg\.com\/lucide@1\.27\.0\/dist\/umd\/lucide\.min\.js/);
  assert.match(product, /ensureLucideIcons\(\)/);
  assert.match(product, /normalizeInterfaceIcons\(\)/);
  assert.match(product, /Extended_Pictographic/);
  assert.doesNotMatch(product, /lucide@latest|\^1\.27\.0|~1\.27\.0/);
});

test('la ruta canónica del ERP abre el acceso real sin omitir autenticación', async () => {
  const entry = await read('creditek/erp/index.html');
  assert.match(entry, /window\.location\.replace\('\.\/app\.html'\)/);
  assert.match(entry, /http-equiv="refresh" content="0; url=\.\/app\.html"/);
  assert.match(entry, /data-kora-brand data-variant="login"/);
  assert.doesNotMatch(entry, /supabase|password|token|service_role/i);
});

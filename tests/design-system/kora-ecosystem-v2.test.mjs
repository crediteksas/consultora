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
  assert.match(source, /requestAnimationFrame\(\(\) => root\.dataset\.koraStable = 'true'\)/);
});

test('mantiene responsive, reducción de movimiento y tablas locales', async () => {
  const ecosystem = await read('design-system/components/kora-ecosystem.css');
  assert.match(ecosystem, /max-width: 63\.999rem/);
  assert.match(ecosystem, /max-width: 47\.999rem/);
  assert.match(ecosystem, /prefers-reduced-motion: reduce/);
  assert.match(ecosystem, /table\s*\{[\s\S]*min-width: max\(100%, 40rem\)/);
});

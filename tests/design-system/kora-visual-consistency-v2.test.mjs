import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => readFile(path.join(root, relative), 'utf8');

test('el control superior conserva la función de colapsar sin depender de una carga tardía', async () => {
  const source = await read('creditek/erp/sidebar.js');

  assert.match(source, /class="kora-icon-button kora-navigation-toggle ghost"/);
  assert.match(source, /aria-label="Colapsar navegación"/);
  assert.match(source, /data-kora-tooltip="Colapsar navegación"/);
  assert.match(source, /data-lucide-static="\$\{name\}"/);
  assert.match(source, /koraStaticIcon\('panel-left-close'\)/);
  assert.match(source, /addEventListener\('click',[\s\S]*sidebarCollapsed/);
  assert.match(source, /syncNavigationControl/);
});

test('el shell compartido no genera botones vacíos', async () => {
  const source = await read('creditek/erp/sidebar.js');
  const templates = [...source.matchAll(/<button\b[\s\S]*?<\/button>/g)].map(match => match[0]);

  assert.ok(templates.length > 0);
  templates.forEach(button => {
    assert.match(button, /aria-label=|[\p{L}\p{N}]/u);
    assert.doesNotMatch(button, /<button[^>]*>\s*<\/button>/);
  });
});

test('Dashboard y Catálogo consumen la misma variante clara del shell', async () => {
  const [dashboard, catalogo, dashboardCss, shellCss] = await Promise.all([
    read('creditek/erp/tablero.html'),
    read('creditek/erp/catalogo.html'),
    read('design-system/components/kora-dashboard.css'),
    read('design-system/components/kora-shell.css'),
  ]);

  assert.match(dashboard, /sidebar\.js\?v=2\.0\.9" data-kora-shell="1\.0\.0"/);
  assert.match(catalogo, /sidebar\.js\?v=2\.0\.9" data-kora-shell="1\.0\.0"/);
  assert.match(shellCss, /\.kora-sidebar\s*\{[^}]*background:\s*var\(--ctk-color-neutral-50\)/s);
  assert.doesNotMatch(dashboardCss, /body\[data-kora-dashboard="1\.0\.0"\]\s+\.kora-(?:shell|sidebar|topbar|nav|icon|store|profile|wordmark|company)/);
  assert.doesNotMatch(dashboardCss, /background:\s*var\(--ctk-color-primary-950\)/);
});

test('Dashboard no altera geometría ni responsive del shell compartido', async () => {
  const dashboardCss = await read('design-system/components/kora-dashboard.css');

  assert.doesNotMatch(dashboardCss, /body\[data-kora-dashboard="1\.0\.0"\]\s+\.kora-topbar/);
  assert.doesNotMatch(dashboardCss, /body\[data-kora-dashboard="1\.0\.0"\]\s+\[data-kora-notifications\]/);
  assert.doesNotMatch(dashboardCss, /body\[data-kora-dashboard="1\.0\.0"\]\s+\.kora-extension/);
});

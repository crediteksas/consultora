import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const read = relative => readFile(new URL(`../../${relative}`, import.meta.url), 'utf8');

test('las 40 pantallas del shell declaran un viewport adaptable', async () => {
  const directory = new URL('../../creditek/erp/', import.meta.url);
  const files = (await readdir(directory)).filter(name => name.endsWith('.html'));
  let shellPages = 0;

  for (const file of files) {
    const html = await readFile(new URL(file, directory), 'utf8');
    if (!/src="sidebar\.js/.test(html)) continue;
    shellPages += 1;
    assert.match(html, /<meta\s+name="viewport"\s+content="[^"]*width=device-width/i, file);
  }

  assert.equal(shellPages, 40);
});

test('el shell carga una única capa responsive transversal', async () => {
  const shell = await read('creditek/erp/sidebar.js');
  assert.match(shell, /koraResponsiveStyles/);
  assert.match(shell, /kora-responsive\.css\?v=1\.0\.1/);
  assert.match(shell, /koraResponsive/);
  assert.match(shell, /kora-responsive\.js\?v=1\.0\.0/);
});

test('la navegación lateral usa acordeón exclusivo y cortina accesible en escritorio', async () => {
  const [shell, css] = await Promise.all([
    read('creditek/erp/sidebar.js'),
    read('design-system/components/kora-shell.css'),
  ]);

  assert.match(shell, /function setExclusiveNavigationGroup/);
  assert.match(shell, /setExclusiveNavigationGroup\(aside, group, open\)/);
  assert.match(shell, /kora_sidebar_mode_v2/);
  assert.match(shell, /\(min-width: 64rem\) and \(hover: hover\) and \(pointer: fine\)/);
  assert.match(shell, /pointerenter/);
  assert.match(shell, /pointerleave/);
  assert.match(shell, /focusin/);
  assert.match(shell, /focusout/);
  assert.match(shell, /Fijar navegación abierta/);
  assert.match(css, /@media \(min-width: 64rem\) and \(hover: hover\) and \(pointer: fine\)/);
  assert.match(css, /data-sidebar-peek="true"/);
  assert.match(css, /\.kora-sidebar\[data-peek="true"\][\s\S]*width:\s*var\(--ctk-width-sidebar\)/);
  assert.match(css, /@media \(max-width: 63\.999rem\)[\s\S]*data-sidebar-collapsed="true"\][\s\S]*width:\s*var\(--ctk-width-sidebar\)/);
  assert.match(shell, /!matchMedia\('\(max-width: 63\.999rem\)'\)\.matches/);
});

test('la cabecera móvil separa contexto y acciones sin recortar nombres', async () => {
  const css = await read('design-system/components/kora-responsive.css');
  assert.match(css, /grid-template-columns:\s*2\.75rem minmax\(0, 1fr\)/);
  assert.match(css, /\.kora-topbar__actions[\s\S]*grid-column:\s*1 \/ -1/);
  assert.match(css, /text-overflow:\s*ellipsis/);
  assert.match(css, /\.kora-store select[\s\S]*width:\s*100%/);
  assert.match(css, /@media \(max-width: 79\.999rem\)[\s\S]*\.kora-command[\s\S]*display:\s*none/);
});

test('el drawer móvil abierto prevalece sobre la preferencia compacta del escritorio', async () => {
  const [shell, css] = await Promise.all([
    read('creditek/erp/sidebar.js'),
    read('design-system/components/kora-shell.css'),
  ]);
  const mobile = css.slice(css.indexOf('@media (max-width: 63.999rem)'));
  assert.match(mobile, /\.kora-shell-root\[data-sidebar-collapsed="true"\] \.kora-sidebar\[data-open="true"\]\s*\{\s*transform:\s*translateX\(0\)/);
  assert.match(shell, /kora-shell\.css\?v=2\.0\.6/);
  assert.match(shell, /navigationMedia\.addEventListener\?\.\('change', \(\) => \{[\s\S]*?if \(aside\.dataset\.open === 'true'\) closeDrawer\(\);[\s\S]*?syncNavigationControl\(\);\s*\}\)/);
});

test('tablas de lectura se convierten en fichas y tablas editables conservan scroll', async () => {
  const [css, js] = await Promise.all([
    read('design-system/components/kora-responsive.css'),
    read('creditek/erp/kora-responsive.js'),
  ]);
  assert.match(js, /tbody input, tbody select, tbody textarea/);
  assert.match(js, /kora-responsive-cards/);
  assert.match(js, /kora-responsive-scroll/);
  assert.match(js, /cell\.dataset\.koraLabel/);
  assert.doesNotMatch(js, /\bfetch\s*\(|\bsupabase\b|\.rpc\s*\(|\binsert\s*\(|\bupdate\s*\(|\bdelete\s*\(/i);
  assert.match(js, /tbody tr, tfoot tr/);
  assert.match(js, /queueMicrotask/);
  assert.match(css, /table\.kora-responsive-cards :where\(tbody, tfoot\) td::before/);
  assert.match(css, /content:\s*attr\(data-kora-label\)/);
  assert.match(css, /table\.kora-responsive-scroll/);
  assert.match(css, /tr\[hidden\]/);
});

test('modales, filtros, acciones y anchos extremos tienen reflow propio', async () => {
  const css = await read('design-system/components/kora-responsive.css');
  assert.match(css, /max-height:\s*calc\(100dvh - 1rem\)/);
  assert.match(css, /\.toolbar, \.filters, \.filtros, \.filter-bar, \.filter-row/);
  assert.match(css, /@media \(max-width: 22\.5rem\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /:where\(input, select, textarea\)[\s\S]*font-size:\s*1rem/);
});

test('filtros y métricas compartidos se reorganizan por ancho disponible también en escritorio', async () => {
  const css = await read('design-system/components/kora-responsive.css');
  assert.match(css, /repeat\(auto-fit, minmax\(min\(100%, 18rem\), 1fr\)\)/);
  assert.match(css, /repeat\(auto-fit, minmax\(min\(100%, 14rem\), 1fr\)\)/);
  assert.match(css, /\.metric strong\s*\{[^}]*margin-top: auto;[^}]*white-space: normal;/s);
});

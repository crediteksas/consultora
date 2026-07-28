import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => readFile(path.join(root, relative), 'utf8');

test('usa el activo oficial verificable de Creditek sin recrear el logo', async () => {
  const asset = await readFile(path.join(root, 'creditek/agentes/logos/creditek_logo_corregido_alta.png'));
  const source = await read('design-system/components/kora-product.js');

  assert.equal(
    createHash('sha256').update(asset).digest('hex'),
    '8e24591baa84201ea72eab0638b42e11af4503d24230548d6385aedad8a45191',
  );
  assert.match(source, /creditek_logo_corregido_alta\.png/);
  assert.match(source, /corporateFavicon: '\/creditek\/agentes\/logos\/creditek_logo_corregido_alta\.png'/);
  assert.match(source, /appIcon: null/);
  assert.match(source, /startupImage: null/);
  assert.match(source, /link\[rel~="icon"\]/);
  assert.doesNotMatch(source, /<svg|data:image|logo-dot|logo-icon/);
});

test('KoraBrand es la fuente compartida y accesible para producto y empresa', async () => {
  const [source, css] = await Promise.all([
    read('design-system/components/kora-product.js'),
    read('design-system/components/kora-product.css'),
  ]);

  assert.match(source, /window\.KoraBrand = Object\.freeze/);
  assert.match(source, /version: '1\.0\.1'/);
  assert.match(source, /dataset\.koraBrandVersion = '1\.0\.1'/);
  assert.doesNotMatch(source, /documentElement\.dataset\.koraBrand\s*=/);
  assert.match(source, /root\.dataset\.productName \|\| 'KORA'/);
  assert.match(source, /setAttribute\('aria-label', `\$\{productName\} — Creditek`\)/);
  assert.match(source, /data-kora-brand/);
  assert.match(css, /\.kora-brand--sidebar-collapsed/);
  assert.match(css, /\.kora-brand--login-inverse/);
  assert.match(css, /\.kora-brand--compact-inverse/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/gi);
});

test('el shell usa KoraBrand y no texto corporativo manual', async () => {
  const [source, css] = await Promise.all([
    read('creditek/erp/sidebar.js'),
    read('design-system/components/kora-shell.css'),
  ]);

  assert.match(source, /data-kora-brand data-variant="sidebar"/);
  assert.match(source, /sidebar-collapsed/);
  assert.match(source, /title="KORA — Creditek"/);
  assert.doesNotMatch(source, /kora-company|kora-wordmark/);
  assert.match(css, /\.kora-drawer-close/);
  assert.match(css, /height: var\(--ctk-height-control-sm\)/);
  assert.match(css, /border-radius: var\(--ctk-radius-full\)/);
});

test('login, agentes y superficies públicas consumen la marca compartida', async () => {
  const contracts = new Map([
    ['creditek/erp/app.html', 'login'],
    ['creditek/erp/cambiar-clave.html', 'login'],
    ['creditek/erp/validacion.html', 'login'],
    ['creditek/erp/registro.html', 'public'],
    ['creditek/agentes/index.html', 'login'],
    ['creditek/agentes/agente3-meta-ads.html', 'compact-inverse'],
    ['creditek/agentes/creditek-agente-calendario.html', 'sidebar'],
    ['creditek/agentes/creditek-gbp-fichas.html', 'public'],
    ['creditek/portal/index.html', 'login-inverse'],
    ['creditek/convenios/index.html', 'login-inverse'],
    ['creditek/legal/index.html', 'public'],
  ]);

  for (const [file, variant] of contracts) {
    const html = await read(file);
    assert.match(html, new RegExp(`data-kora-brand data-variant="${variant}"`), file);
    assert.match(html, /kora-product\.js/, file);
  }
});

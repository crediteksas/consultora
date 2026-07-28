import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => readFile(path.join(root, relative), 'utf8');

test('los controles críticos del header conservan iconos visibles sin depender de Lucide remoto', async () => {
  const [source, css] = await Promise.all([
    read('creditek/erp/sidebar.js'),
    read('design-system/components/kora-shell.css'),
  ]);

  for (const icon of ['menu', 'panel-left-close', 'sliders-horizontal', 'bell', 'x']) {
    assert.match(source, new RegExp(`koraStaticIcon\\('${icon}'\\)`));
  }
  assert.match(css, /\.kora-icon-button\s*>\s*svg\s*\{[^}]*height:\s*var\(--ctk-icon-md\)[^}]*width:\s*var\(--ctk-icon-md\)/s);
  assert.match(css, /\.kora-icon-button\s*\{[^}]*padding:\s*0/s);
  assert.match(css, /\.kora-icon-button:active/);
});

test('cada opción de inventario tiene un icono semántico propio', async () => {
  const source = await read('creditek/erp/sidebar.js');
  const expected = new Map([
    ['Catálogo', 'grid-2x2'],
    ['Remisiones', 'file-output'],
    ['Stock', 'warehouse'],
    ['Traslados', 'arrow-left-right'],
    ['Ajustes', 'sliders-horizontal'],
    ['Cierre mes', 'calendar-check'],
    ['Auditoría cruzada', 'file-search'],
    ['Kardex', 'history'],
  ]);

  for (const [label, icon] of expected) {
    assert.match(
      source,
      new RegExp(`label:\\s*'${label}'[^\\n]*lucide:\\s*'${icon}'`),
    );
  }
  assert.equal(new Set(expected.values()).size, expected.size);
});

test('el acceso de agentes se identifica como AURA y conserva Creditek', async () => {
  const [portal, product] = await Promise.all([
    read('creditek/agentes/index.html'),
    read('design-system/components/kora-product.js'),
  ]);

  assert.match(portal, /<title>AURA · Agentes — Creditek<\/title>/);
  assert.match(portal, /data-kora-brand data-variant="login" data-product-name="AURA"/);
  assert.match(product, /root\.dataset\.productName \|\| 'KORA'/);
  assert.match(product, /setAttribute\('aria-label', `\$\{productName\} — Creditek`\)/);
});

test('el campo de contraseña de AURA permanece editable y accesible', async () => {
  const portal = await read('creditek/agentes/index.html');
  const input = portal.match(/<input\s+type="password"\s+id="login-pwd"[^>]*>/)?.[0] || '';

  assert.match(input, /name="password"/);
  assert.match(input, /autocomplete="current-password"/);
  assert.match(input, /aria-label="Contraseña de acceso"/);
  assert.match(input, /onkeydown="if\(event\.key==='Enter'\)doLogin\(\)"/);
  assert.doesNotMatch(input, /\b(?:disabled|readonly)\b/i);
  assert.match(portal, /\.login-field input\s*\{[^}]*pointer-events:\s*auto/s);
});

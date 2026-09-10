import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const pages = [
  ['index.html', 'home'],
  ['creditek-agente-redes.html', 'design'],
  ['creditek-agente-respuestas.html', 'sofia'],
  ['agente3-meta-ads.html', 'meta'],
  ['creditek-agente-calendario.html', 'calendar'],
  ['creditek-gbp-fichas.html', 'google-business'],
  ['aura-finanzas.html', 'finanzas'],
];

async function source(relative) {
  return readFile(new URL(`creditek/agentes/${relative}`, root), 'utf8');
}

test('todas las pantallas públicas de AURA cargan la base responsive compartida', async () => {
  for (const [file, page] of pages) {
    const html = await source(file);
    assert.match(html, /<meta[^>]+name=["']viewport["']/i, `${file} necesita viewport`);
    assert.match(html, /aura-responsive\.css/, `${file} necesita la hoja responsive`);
    assert.match(html, new RegExp(`data-aura-page=["']${page}["']`), `${file} necesita identidad de pantalla`);
  }
});

test('Sofía usa navegación por paneles en móvil y un panel de detalles en ventana angosta', async () => {
  const [html, css, js] = await Promise.all([
    source('creditek-agente-respuestas.html'),
    source('aura-responsive.css'),
    source('aura-responsive.js'),
  ]);
  assert.match(html, /aura-responsive\.js/);
  assert.match(css, /data-sofia-pane=["']chat["']/);
  assert.match(css, /data-sofia-pane=["']table["']/);
  assert.match(css, /max-width:\s*47\.999rem/);
  assert.match(css, /max-width:\s*74\.999rem/);
  assert.match(js, /Conversaciones/);
  assert.match(js, /Detalles/);
  assert.match(js, /MutationObserver/);
});

test('Sofía conserva el título y los seis indicadores completos en ventanas estrechas', async () => {
  const [html, css] = await Promise.all([
    source('creditek-agente-respuestas.html'),
    source('aura-responsive.css'),
  ]);
  assert.match(html, /Sofía\s*·\s*<span>CRM WhatsApp<\/span>/);
  assert.match(css, /max-width:\s*89\.999rem/);
  assert.match(css, /\.topbar-actions\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1/s);
  assert.match(css, /\.topbar-stats\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.match(css, /grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.topbar-left h1\s*\{[^}]*white-space:\s*nowrap/s);
});

test('la base responsive protege controles táctiles, modales y tablas', async () => {
  const css = await source('aura-responsive.css');
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /font-size:\s*16px\s*!important/);
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /max-height:\s*92dvh/);
});

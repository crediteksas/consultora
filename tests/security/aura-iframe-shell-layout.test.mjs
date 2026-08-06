import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../creditek/agentes/index.html', import.meta.url), 'utf8');

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1] || '';
}

test('el iframe ocupa el área de contenido sin cubrir el shell AURA', () => {
  const rule = cssRule('.iframe-view');
  assert.match(rule, /flex:\s*1/);
  assert.match(rule, /min-height:\s*0/);
  assert.match(rule, /width:\s*100%/);
  assert.doesNotMatch(rule, /position:\s*fixed/);
  assert.doesNotMatch(rule, /100vw|100vh/);
  assert.doesNotMatch(rule, /z-index:\s*1000/);
});

test('el área principal conserva sidebar, topbar y scroll interno del módulo', () => {
  assert.match(html, /#app\.visible\{display:flex\}/);
  assert.doesNotMatch(html, /#app\.visible\{display:grid\}/);
  assert.match(html, /<div class="sidebar">/);
  assert.match(html, /<div class="topbar">/);
  assert.match(html, /<div class="iframe-view" id="iframe-view">/);
  assert.match(cssRule('.main-area'), /overflow:\s*hidden/);
  assert.match(cssRule('iframe'), /flex:\s*1/);
});

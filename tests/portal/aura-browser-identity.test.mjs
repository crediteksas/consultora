import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const pages = [
  'creditek/agentes/index.html',
  'creditek/agentes/creditek-agente-redes.html',
  'creditek/agentes/creditek-agente-respuestas.html',
  'creditek/agentes/agente3-meta-ads.html',
  'creditek/agentes/creditek-agente-calendario.html',
  'creditek/agentes/creditek-gbp-fichas.html',
  'creditek/portal/index.html',
];

test('AURA usa el isotipo oficial en pestañas y accesos directos', async () => {
  for (const page of pages) {
    const source = await readFile(new URL(page, root), 'utf8');
    assert.match(source, /<title>AURA \| Creditek<\/title>/, page);
    assert.match(source, /rel="icon"[^>]+\/creditek\/assets\/aura\/favicon\.svg/, page);
    assert.match(source, /rel="icon"[^>]+\/creditek\/assets\/aura\/favicon\.png/, page);
    assert.match(source, /rel="apple-touch-icon"[^>]+\/creditek\/assets\/aura\/apple-touch-icon\.png/, page);
    assert.match(source, /rel="manifest"/, page);
    assert.doesNotMatch(source, /<text[^>]*>\s*C\s*<\/text>/i, page);
  }
});

test('los archivos de favicon y PWA existen y declaran AURA', async () => {
  for (const asset of [
    'creditek/assets/aura/favicon.ico',
    'creditek/assets/aura/favicon.svg',
    'creditek/assets/aura/favicon.png',
    'creditek/assets/aura/apple-touch-icon.png',
    'creditek/assets/aura/icon-192.png',
    'creditek/assets/aura/icon-512.png',
  ]) {
    await access(new URL(asset, root));
  }

  for (const manifestPath of [
    'creditek/agentes/manifest.json',
    'creditek/portal/manifest.json',
  ]) {
    const manifest = JSON.parse(await readFile(new URL(manifestPath, root), 'utf8'));
    assert.equal(manifest.name, 'AURA | Creditek');
    assert.equal(manifest.short_name, 'AURA');
    assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
    assert.ok(manifest.icons.some(icon => icon.sizes === '512x512'));
  }
});

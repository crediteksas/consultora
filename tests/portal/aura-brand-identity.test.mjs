import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const portalPath = new URL('../../creditek/portal/index.html', import.meta.url);
const agentsDir = new URL('../../creditek/agentes/', import.meta.url);

const portal = await readFile(portalPath, 'utf8');
const agentPages = await Promise.all([
  'index.html',
  'creditek-agente-redes.html',
  'creditek-agente-respuestas.html',
  'agente3-meta-ads.html',
  'creditek-agente-calendario.html',
  'creditek-gbp-fichas.html',
].map(async file => [file, await readFile(new URL(file, agentsDir), 'utf8')]));

test('el Portal B2B declara AURA como producto visible', () => {
  assert.match(portal, /<title>AURA · Portal de Pedidos — Creditek<\/title>/);
  assert.match(
    portal,
    /data-kora-brand[^>]*data-product-name="AURA"|data-product-name="AURA"[^>]*data-kora-brand/,
  );
});

test('las superficies AURA no contienen referencias visibles a KORA', () => {
  const visiblePortal = portal
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<link\b[^>]*kora[^>]*>/gi, '')
    .replace(/<script\b[^>]*kora[^>]*><\/script>/gi, '')
    .replace(/\bdata-kora-[\w-]+(?:="[^"]*")?/gi, '')
    .replace(/\bclass="[^"]*\bkora-[^"]*"/gi, '');

  assert.doesNotMatch(visiblePortal, />[^<]*\bKORA\b[^<]*</i);
  assert.doesNotMatch(visiblePortal, /(?:title|content|aria-label)="[^"]*\bKORA\b/i);

  for (const [file, source] of agentPages) {
    assert.doesNotMatch(source, />[^<]*\bKORA\b[^<]*</i, file);
    assert.doesNotMatch(source, /(?:title|content|aria-label)="[^"]*\bKORA\b/i, file);
  }
});

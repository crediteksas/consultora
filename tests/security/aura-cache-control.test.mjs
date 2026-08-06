import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => readFile(path.join(root, relative), 'utf8');

test('AURA Hub ejecuta un Worker antes de assets para retirar caché heredada', async () => {
  const config = JSON.parse(await read('wrangler.aura-hub.jsonc'));
  assert.equal(config.main, 'creditek/workers/aura-hub/src/index.js');
  assert.equal(config.assets.binding, 'ASSETS');
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.routes.some(route => route.pattern === 'registro.crediteksas.com/creditek/agentes*'), true);
  assert.equal(config.routes.some(route => route.pattern === 'registro.crediteksas.com/creditek/agentes/agente3-meta-ads*'), true);
});

test('todas las entradas de AURA sirven directamente el mismo index canónico sin caché', async () => {
  const { default: worker } = await import('../../creditek/workers/aura-hub/src/index.js');
  const html = '<!doctype html><title>AURA | Creditek</title>';
  let requestedPath = '';
  const env = { ASSETS: { fetch: async request => {
    requestedPath = new URL(request.url).pathname;
    return new Response(html, { headers: { 'content-type': 'text/html' } });
  } } };
  for (const pathname of ['/creditek/agentes', '/creditek/agentes/', '/creditek/agentes/index.html']) {
    const response = await worker.fetch(new Request(`https://registro.crediteksas.com${pathname}`), env);
    assert.equal(requestedPath, '/creditek/agentes/index.html');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store, no-cache, must-revalidate, max-age=0');
    assert.equal(response.headers.get('cloudflare-cdn-cache-control'), 'no-store');
    assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
    assert.equal(response.headers.get('x-aura-worker'), 'aura-hub');
    assert.equal(response.headers.get('x-aura-document'), '/creditek/agentes/index.html');
    assert.equal(response.headers.get('pragma'), 'no-cache');
    assert.equal(response.headers.get('expires'), '0');
    assert.equal(await response.text(), html);
  }
});

test('Redes Sociales no conserva una versión anterior del publicador', async () => {
  const worker = await read('creditek/workers/aura-hub/src/index.js');
  assert.match(worker, /'\/creditek\/agentes\/creditek-agente-redes\.html'/);
});

test('el build no crea un segundo documento principal versionado', async () => {
  const build = await read('scripts/build-aura-hub.mjs');
  assert.doesNotMatch(build, /aura-otp-20260802\.html/);
});

test('ninguna ruta o fallback de AURA sirve el HTML histórico', async () => {
  const { default: worker } = await import('../../creditek/workers/aura-hub/src/index.js');
  const env = { ASSETS: { fetch: async () => new Response('<h1>AURA</h1>', { headers: { 'content-type': 'text/html' } }) } };
  for (const pathname of ['/creditek/agentes', '/creditek/agentes/', '/creditek/agentes/index.html']) {
    const response = await worker.fetch(new Request(`https://registro.crediteksas.com${pathname}`), env);
    const body = await response.text();
    assert.doesNotMatch(body, /Clave de acceso|Acceso pausado|Sistema operativo/i);
    assert.equal(response.headers.get('cache-control'), 'no-store, no-cache, must-revalidate, max-age=0');
  }
});

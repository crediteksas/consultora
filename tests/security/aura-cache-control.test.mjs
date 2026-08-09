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
  assert.deepEqual(config.routes.map(route => route.pattern), ['registro.crediteksas.com/creditek/agentes*']);
});

test('el documento principal de AURA siempre responde no-store', async () => {
  const { default: worker } = await import('../../creditek/workers/aura-hub/src/index.js');
  const html = '<!doctype html><title>AURA | Creditek</title>';
  let requestedPath = '';
  const env = { ASSETS: { fetch: async request => {
    requestedPath = new URL(request.url).pathname;
    return new Response(html, { headers: { 'content-type': 'text/html' } });
  } } };
  const response = await worker.fetch(new Request('https://registro.crediteksas.com/creditek/agentes/'), env);
  assert.equal(requestedPath, '/creditek/agentes/index.html');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store, no-cache, must-revalidate, max-age=0');
  assert.equal(response.headers.get('pragma'), 'no-cache');
  assert.equal(response.headers.get('expires'), '0');
  assert.equal(await response.text(), html);
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

test('el alias de autenticación de la shell resuelve el módulo canónico', async () => {
  const { default: worker } = await import('../../creditek/workers/aura-hub/src/index.js');
  let requestedPath = '';
  const env = { ASSETS: { fetch: async request => {
    requestedPath = new URL(request.url).pathname;
    return new Response('export const auraAuth = {};', { headers: { 'content-type': 'text/javascript' } });
  } } };

  const response = await worker.fetch(new Request('https://registro.crediteksas.com/creditek/agentes/aura-auth-otp-20260802.mjs'), env);

  assert.equal(requestedPath, '/creditek/agentes/aura-auth.mjs');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store, no-cache, must-revalidate, max-age=0');
});

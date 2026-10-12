import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions, Response } from 'miniflare';
import '../../scripts/build-aura-organic-shell.mjs';

test('actual installed-app route Worker adds navigation and preserves the live HTML and every unrelated request', async t => {
  const html = await readFile('releases/aura-organic-20261011/baseline/shell-index.html', 'utf8');
  const calls = [];
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: await readFile('dist/aura-organic-shell/worker.mjs', 'utf8'), compatibilityDate: '2026-07-23',
    outboundService: async request => {
      calls.push({ url: request.url, method: request.method, body: await request.text(), auth: request.headers.get('authorization') });
      return new Response('UNCHANGED ORIGIN', { status: 202, headers: { 'x-origin': 'kept' } });
    },
  }));
  t.after(() => mf.dispose());
  for (const path of ['/creditek/agentes/', '/creditek/agentes/?source=pwa', '/creditek/agentes/index.html?source=pwa']) {
    const r = await mf.dispatchFetch('https://aura.crediteksas.com' + path);
    const body = await r.text();
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('x-aura-organic-app-release'), '20261011-shell');
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(body.replace(/<a[^>]+data-organic-app-(?:nav|card)[^]*?<\/a>/g, ''), html);
    assert.equal((body.match(/data-organic-app-nav/g) || []).length, 1);
    assert.equal((body.match(/data-organic-app-card/g) || []).length, 1);
  }
  assert.equal(calls.length, 0);
  const head = await mf.dispatchFetch('https://aura.crediteksas.com/creditek/agentes/', { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
  const denied = await mf.dispatchFetch('https://aura.crediteksas.com/creditek/agentes/', { method: 'POST', body: 'test' });
  assert.equal(denied.status, 405); assert.equal(denied.headers.get('allow'), 'GET, HEAD');
  for (const path of ['/creditek/agentes/aura-organic-studio.html', '/creditek/agentes/aura-auth.mjs', '/api/sofia']) {
    const r = await mf.dispatchFetch('https://aura.crediteksas.com' + path, { method: 'POST', body: 'preserved', headers: { authorization: 'LOCAL-TEST' } });
    assert.equal(r.status, 202); assert.equal(r.headers.get('x-origin'), 'kept');
    assert.equal(r.headers.get('x-aura-organic-app-release'), null);
    assert.equal(await r.text(), 'UNCHANGED ORIGIN');
    assert.deepEqual(calls.at(-1), { url: 'https://aura.crediteksas.com' + path, method: 'POST', body: 'preserved', auth: 'LOCAL-TEST' });
  }
});

test('shell deployment never replaces assets, changes routes, or targets the origin Worker', async () => {
  const config = JSON.parse(await readFile('releases/aura-organic-20261011/wrangler.shell.jsonc', 'utf8'));
  assert.equal(config.name, 'creditek-aura-shell');
  for (const key of ['assets', 'routes', 'services', 'unsafe', 'vars']) assert.equal(config[key], undefined);
  assert.equal(config.compatibility_date, '2026-07-23');
});

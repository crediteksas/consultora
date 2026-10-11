import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions, Response } from 'miniflare';

const paths = ['/creditek/agentes/', '/creditek/agentes/index.html', '/creditek/agentes/creditek-agente-calendario.html'];
const html = '<!doctype html><html><body><main>LIVE ASSET, NOT OLD WORKER HOME</main></body></html>';
test('organic navigation preserves actual asset HTML and delegates all unrelated requests', async t => {
  const compiled = await build({ stdin: { contents: `import { organicOverlay } from './src/aura-organic-overlay.mjs'; export default organicOverlay({ fetch() { return new Response('LEGACY'); } }, {});`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm' });
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: compiled.outputFiles[0].text, compatibilityDate: '2026-07-23', serviceBindings: { ASSETS: async request => new Response(request.method === 'HEAD' ? null : html, { headers: { 'content-type': 'text/html', etag: 'old-validator', 'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT' } }) } }));
  t.after(() => mf.dispose());
  for (const path of paths) {
    const response = await mf.dispatchFetch('https://aura.test' + path);
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.match(text, /Contenido orgánico/);
    assert.equal(text.replace(/<nav aria-label="Publicación orgánica"[^]*?<\/nav>/, ''), html);
    assert.equal(response.headers.get('etag'), null);
    assert.equal(response.headers.get('last-modified'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(await (await mf.dispatchFetch('https://aura.test' + paths[0], { method: 'HEAD' })).text(), '');
  for (const path of ['/api/sofia', '/api/registro', '/creditek/agentes/aura-auth.mjs']) assert.equal(await (await mf.dispatchFetch('https://aura.test' + path)).text(), 'LEGACY');
  assert.equal(await (await mf.dispatchFetch('https://aura.test' + paths[0], { method: 'POST' })).text(), 'LEGACY');
});
test('deployment uses only three exact worker-first paths and retains the original asset header policy', async () => {
  const config = JSON.parse(await readFile('releases/aura-organic-20261011/wrangler.overlay.jsonc', 'utf8'));
  assert.equal(config.unsafe.metadata.keep_assets, true);
  assert.deepEqual(config.unsafe.metadata.assets.config.run_worker_first, paths);
  assert.equal(config.unsafe.metadata.assets.config._headers, '/creditek/agentes/*\n  Cache-Control: no-cache, max-age=0, must-revalidate\n');
  assert.equal(config.assets, undefined); // Never upload dist/aura as a replacement asset set.
});

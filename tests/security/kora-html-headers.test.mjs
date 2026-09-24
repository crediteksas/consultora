import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../src/kora-version-worker.mjs';

test('las respuestas HTML reciben protección básica y CSP solo de informe', async () => {
  const assets = { fetch: async () => new Response('<h1>KORA</h1>', { headers: { 'content-type': 'text/html; charset=utf-8' } }) };
  const response = await worker.fetch(new Request('https://kora.example/creditek/erp/app.html'), { ASSETS: assets });
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.match(response.headers.get('content-security-policy-report-only'), /frame-ancestors 'none'/);
  assert.equal(response.headers.get('content-security-policy'), null, 'aún no se bloquean recursos hasta revisar reportes');
});

test('las cabeceras HTML no cambian respuestas JavaScript', async () => {
  const assets = { fetch: async () => new Response('const ok = true;', { headers: { 'content-type': 'application/javascript' } }) };
  const response = await worker.fetch(new Request('https://kora.example/creditek/erp/app.js'), { ASSETS: assets });
  assert.equal(response.headers.get('content-security-policy-report-only'), null);
  assert.equal(await response.text(), 'const ok = true;');
});

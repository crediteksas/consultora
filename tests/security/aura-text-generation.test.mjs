import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const agent1 = await readFile(new URL('../../creditek/agentes/creditek-agente-redes.html', import.meta.url), 'utf8');
const calendar = await readFile(new URL('../../creditek/agentes/creditek-agente-calendario.html', import.meta.url), 'utf8');
const workerSource = await readFile(new URL('../../creditek/workers/gemini-proxy/index.js', import.meta.url), 'utf8');

test('Agente 1 y Calendario generan texto mediante el Worker autenticado, sin credenciales en el navegador', () => {
  for (const frontend of [agent1, calendar]) {
    assert.match(frontend, /aura-text-client\.mjs/);
    assert.match(frontend, /requestAuraText/);
    assert.doesNotMatch(frontend, /api\.anthropic\.com|anthropic-dangerous-direct-browser-access|x-api-key|sk-ant-|ck_api_key/);
  }
});

test('el Worker expone generación de texto protegida por la sesión AURA', () => {
  assert.match(workerSource, /path === '\/generate-text'/);
  assert.match(workerSource, /authenticateAura\(request, env\)/);
  assert.match(workerSource, /generateAuraText/);
});

test('el generador backend limita entrada y devuelve texto sin revelar el proveedor', async () => {
  const { generateAuraText } = await import('../../creditek/workers/gemini-proxy/text.mjs');
  const calls = [];
  const response = await generateAuraText(
    { GEMINI_API_KEY: 'server-only' },
    { prompt: 'Escribe un titular breve', system: 'Habla en español', maxTokens: 120 },
    async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Tu celular, más cerca.' }] } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, text: 'Tu celular, más cerca.' });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com/);
  assert.doesNotMatch(JSON.stringify(calls[0].options.body), /server-only/);
});

test('el generador backend rechaza prompts vacíos o excesivos sin llamar al proveedor', async () => {
  const { generateAuraText } = await import('../../creditek/workers/gemini-proxy/text.mjs');
  let calls = 0;
  const fetcher = async () => { calls += 1; return new Response('{}'); };

  const empty = await generateAuraText({ GEMINI_API_KEY: 'server-only' }, { prompt: '' }, fetcher);
  const oversized = await generateAuraText(
    { GEMINI_API_KEY: 'server-only' },
    { prompt: 'x'.repeat(50_001) },
    fetcher,
  );

  assert.equal(empty.status, 400);
  assert.equal(oversized.status, 413);
  assert.equal(calls, 0);
});

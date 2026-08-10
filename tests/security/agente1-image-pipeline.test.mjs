import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frontend = await readFile(new URL('../../creditek/agentes/creditek-agente-redes.html', import.meta.url), 'utf8');
const worker = await readFile(new URL('../../creditek/workers/gemini-proxy/index.js', import.meta.url), 'utf8');

test('Agente 1 genera imágenes únicamente mediante Worker y sesión AURA', () => {
  assert.match(frontend, /aura-image-client\.mjs/);
  assert.match(frontend, /import \{ requestAuraImage \} from '\.\/aura-image-client\.mjs'/);
  assert.match(frontend, /return window\.requestAuraImage\(path, payload\)/);
  assert.match(frontend, /llamarBackendImagen\('\/generate'/);
  assert.match(frontend, /llamarBackendImagen\('\/openai\/responses'/);
  assert.match(frontend, /model:\s*'gpt-5\.6'/);
  assert.match(frontend, /action:\s*'generate'/);
  assert.doesNotMatch(frontend, /WORKER_SHARED_SECRET|X-Worker-Secret|api\.openai\.com/);
});

test('el Worker recibe claves solo desde bindings y exige JWT de AURA', () => {
  assert.match(worker, /import \{ authenticateAura \} from '\.\/auth\.mjs'/);
  assert.match(worker, /authenticateAura\(request, env\)/);
  assert.doesNotMatch(worker, /request\.headers\.get\('X-Worker-Secret'\)/);
  assert.match(worker, /env\.OPENAI_API_KEY/);
  assert.match(worker, /env\.GEMINI_API_KEY/);
});

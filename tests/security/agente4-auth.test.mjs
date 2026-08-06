import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frontend = await readFile(new URL('../../creditek/agentes/creditek-agente-calendario.html', import.meta.url), 'utf8');

test('Agente 4 usa el Worker autenticado con la sesión AURA', () => {
  assert.doesNotMatch(frontend, /WORKER_SHARED_SECRET_AGENTE4|X-Worker-Secret/);
  assert.doesNotMatch(frontend, /api\.openai\.com|ck_openai_key/);
  assert.match(frontend, /agente3-aura-session\.mjs/);
  assert.match(frontend, /Authorization: `Bearer \$\{token\}`/);
  assert.match(frontend, /model:\s*'gpt-5\.6'/);
});

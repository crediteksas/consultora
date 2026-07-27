import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateEnvironmentFile } from '../../scripts/generate-kora-environment.mjs';

const valid = {
  KORA_ENV: 'development',
  KORA_VERSION: '1.0.0',
  KORA_ENV_LABEL: 'DESARROLLO',
  KORA_ERP_SUPABASE_URL: 'http://127.0.0.1:54321',
  KORA_ERP_SUPABASE_ANON_KEY: 'public-anon-erp-development',
  KORA_AGENTS_SUPABASE_URL: 'http://127.0.0.1:54322',
  KORA_AGENTS_SUPABASE_ANON_KEY: 'public-anon-agents-development',
  KORA_CLIENTS_WORKER_URL: 'http://127.0.0.1:8787',
  KORA_GEMINI_WORKER_URL: 'http://127.0.0.1:8788',
  KORA_PDF_COMBINER_URL: 'http://127.0.0.1:8789',
  KORA_BOT_WORKER_URL: 'http://127.0.0.1:8791',
  KORA_AGENTS_AUTH_URL: 'http://127.0.0.1:8790',
};

test('genera un archivo determinístico sin imprimir credenciales', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'kora-config-'));
  const first = path.join(directory, 'first.js');
  const second = path.join(directory, 'second.js');
  const logs = [];

  await generateEnvironmentFile(valid, first, { log: message => logs.push(message) });
  await generateEnvironmentFile({ ...valid }, second, { log: message => logs.push(message) });

  assert.equal(await readFile(first, 'utf8'), await readFile(second, 'utf8'));
  assert.match(await readFile(first, 'utf8'), /window\.__KORA_ENV__/);
  assert.doesNotMatch(logs.join(' '), /public-anon/);
});

test('falla antes de escribir cuando falta una variable', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'kora-config-'));
  await assert.rejects(
    generateEnvironmentFile({ ...valid, KORA_ENV_LABEL: '' }, path.join(directory, 'bad.js')),
    /KORA_ENV_LABEL/,
  );
});

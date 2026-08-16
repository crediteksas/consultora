import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scanKoraConfiguration } from '../../scripts/check-kora-config-security.mjs';

test('detecta credenciales administrativas en configuración frontend', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'kora-config-scan-'));
  const file = path.join(directory, 'unsafe.js');
  await writeFile(file, 'window.__KORA_ENV__ = { SUPABASE_SERVICE_KEY: "unsafe" };');

  await assert.rejects(
    scanKoraConfiguration([file]),
    /configuración frontend prohibida/i,
  );
});

test('acepta el adaptador y ejemplos públicos de KORA', async () => {
  const root = path.resolve(import.meta.dirname, '../..');
  await scanKoraConfiguration([
    path.join(root, '.env.example'),
    path.join(root, '.dev.vars.example'),
    path.join(root, 'config/kora-environment.js'),
    path.join(root, 'config/kora-environment.example.js'),
    path.join(root, 'config/staging-data.example.json'),
  ]);
});

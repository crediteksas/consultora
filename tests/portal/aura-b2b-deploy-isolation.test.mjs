import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildAuraB2B } from '../../scripts/build-aura-b2b.mjs';

const root = path.resolve(import.meta.dirname, '../..');

test('el build de AURA B2B publica solo su árbol y nunca KORA ERP o Agentes', async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), 'aura-b2b-build-'));
  try {
    await buildAuraB2B(root, out);
    const portal = await readFile(path.join(out, 'creditek/portal/index.html'), 'utf8');
    assert.match(portal, /AURA/);
    await assert.rejects(() => readFile(path.join(out, 'creditek/erp/app.html')));
    await assert.rejects(() => readFile(path.join(out, 'creditek/agentes/index.html')));
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test('el build general deja de poseer la ruta de AURA B2B', async () => {
  const source = await readFile(path.join(root, 'scripts/build-public.mjs'), 'utf8');
  assert.doesNotMatch(source, /['"]creditek\/portal\/index\.html['"]/);
  assert.doesNotMatch(source, /['"]creditek\/portal\/catalog-admin\.mjs['"]/);
});

test('la configuración dedicada solo captura la ruta del portal', async () => {
  const config = await readFile(path.join(root, 'wrangler.aura-b2b.jsonc'), 'utf8');
  assert.match(config, /registro\.crediteksas\.com\/creditek\/portal\/\*/);
  assert.doesNotMatch(config, /creditek\/erp|creditek\/agentes/);
  assert.match(config, /public-aura-b2b/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildRegistro } from '../../scripts/build-registro.mjs';

const root = path.resolve(import.meta.dirname, '../..');

test('registro genera un artefacto mínimo y separado', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'creditek-registro-'));
  const out = path.join(parent, 'creditek-registro-artifact');
  await buildRegistro(root, out);
  for (const relative of [
    'index.html', 'creditek/convenios/index.html', 'creditek/erp/registro.html',
    'creditek/legal/index.html', 'design-system/components/kora-product.css',
  ]) assert.ok((await stat(path.join(out, relative))).isFile(), relative);
  for (const forbidden of ['creditek/agentes', 'creditek/erp/app.html', 'creditek/portal', 'config']) {
    await assert.rejects(stat(path.join(out, forbidden)));
  }
});

test('el Worker de registro no tiene acceso a KORA, AURA, KV ni secretos', async () => {
  const config = await readFile(path.join(root, 'wrangler.registro.jsonc'), 'utf8');
  const worker = await readFile(path.join(root, 'src/registro-assets-worker.mjs'), 'utf8');
  assert.match(config, /"name": "creditek-registro"/);
  assert.match(config, /"directory": "\.\/dist\/registro"/);
  assert.doesNotMatch(config, /kv_namespaces|d1_databases|vars|routes|service/);
  assert.doesNotMatch(worker, /KORA|AURA|SUPABASE|secret/i);
});

test('el formulario publicado conserva acceso público y captura completa', async () => {
  const html = await readFile(path.join(root, 'creditek/convenios/index.html'), 'utf8');
  assert.doesNotMatch(html, /type=["']password["']/i);
  assert.match(html, /Marco Marín/);
  assert.match(html, /cuentaBancaria:\{/);
  assert.doesNotMatch(html, /capture="environment"/);
});

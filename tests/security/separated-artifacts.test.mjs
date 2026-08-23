import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildKora } from '../../scripts/build-kora.mjs';
import { buildAura } from '../../scripts/build-aura.mjs';
import { verifyKoraArtifact } from '../../scripts/verify-kora-artifact.mjs';
import { verifyAuraArtifact } from '../../scripts/verify-aura-artifact.mjs';

const root = path.resolve(import.meta.dirname, '../..');

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

async function filesUnder(directory, current = directory) {
  const output = [];
  for (const entry of await readdir(current)) {
    const absolute = path.join(current, entry);
    const info = await lstat(absolute);
    if (info.isDirectory()) output.push(...await filesUnder(directory, absolute));
    else output.push(absolute);
  }
  return output.sort();
}

async function treeHash(directory) {
  const hash = createHash('sha256');
  for (const file of await filesUnder(directory)) {
    hash.update(path.relative(directory, file));
    hash.update(await readFile(file));
  }
  return hash.digest('hex');
}

test('los builds son independientes y no modifican el artefacto contrario', async () => {
  const kora = await mkdtemp(path.join(tmpdir(), 'creditek-kora-'));
  const aura = await mkdtemp(path.join(tmpdir(), 'creditek-aura-'));
  await buildKora(root, kora);
  await buildAura(root, aura);

  const auraBefore = await treeHash(aura);
  await buildKora(root, kora);
  assert.equal(await treeHash(aura), auraBefore);

  const koraBefore = await treeHash(kora);
  await buildAura(root, aura);
  assert.equal(await treeHash(kora), koraBefore);
});

test('KORA contiene sólo su aplicación y configuración', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'creditek-kora-'));
  await buildKora(root, out);
  assert.equal(await exists(path.join(out, 'creditek/erp/app.html')), true);
  assert.equal(await exists(path.join(out, 'creditek/agentes')), false);
  assert.equal(await exists(path.join(out, 'creditek/portal')), false);
  assert.equal(await exists(path.join(out, 'creditek/convenios')), false);
  const environment = await readFile(path.join(out, 'config/kora-environment.js'), 'utf8');
  assert.doesNotMatch(environment, /KORA_AGENTS_SUPABASE_/);
});

test('AURA contiene sólo su aplicación y configuración', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'creditek-aura-'));
  await buildAura(root, out);
  assert.equal(await exists(path.join(out, 'creditek/agentes/index.html')), true);
  assert.equal(await exists(path.join(out, 'creditek/erp')), false);
  assert.equal(await exists(path.join(out, 'creditek/portal')), false);
  assert.equal(await exists(path.join(out, 'creditek/convenios')), false);
  const environment = await readFile(path.join(out, 'config/aura-environment.js'), 'utf8');
  assert.doesNotMatch(environment, /KORA_ERP_SUPABASE_|KORA_RELEASES/);
});

test('las guardas rechazan referencias y rutas cruzadas sin whitelist', async () => {
  const kora = await mkdtemp(path.join(tmpdir(), 'creditek-kora-'));
  await buildKora(root, kora);
  await mkdir(path.join(kora, 'creditek/agentes'), { recursive: true });
  await writeFile(path.join(kora, 'creditek/agentes/index.html'), '<p>AURA</p>');
  await assert.rejects(verifyKoraArtifact(kora), /Ruta prohibida en KORA/);

  const aura = await mkdtemp(path.join(tmpdir(), 'creditek-aura-'));
  await buildAura(root, aura);
  await writeFile(path.join(aura, 'creditek/agentes/cross.js'), "const source = '../erp/sidebar.js';\n");
  await assert.rejects(verifyAuraArtifact(aura), /Referencia cruzada en AURA/);
});

test('los artefactos excluyen archivos privados y administrativos', async () => {
  const outputs = [
    await mkdtemp(path.join(tmpdir(), 'creditek-kora-')),
    await mkdtemp(path.join(tmpdir(), 'creditek-aura-')),
  ];
  await buildKora(root, outputs[0]);
  await buildAura(root, outputs[1]);
  for (const out of outputs) {
    for (const file of await filesUnder(out)) {
      const relative = path.relative(out, file);
      assert.doesNotMatch(relative, /(?:^|\/)(?:migrations?|tests?|scripts)(?:\/|$)/);
      assert.doesNotMatch(relative, /(?:\.sql|\.pem|package-lock\.json|wrangler\.(?:jsonc|toml))$/);
    }
  }
});

test('el build histórico permanece como ruta separada e intacta', async () => {
  const source = await readFile(path.join(root, 'scripts/build-public.mjs'), 'utf8');
  const wrangler = await readFile(path.join(root, 'wrangler.jsonc'), 'utf8');
  assert.match(source, /export async function buildPublic/);
  assert.match(source, /path\.join\(rootDir, 'public'\)/);
  assert.match(wrangler, /"directory": "\.\/public"/);
});

test('los Wrangler locales apuntan a artefactos distintos y no declaran routing', async () => {
  const kora = await readFile(path.join(root, 'wrangler.kora.jsonc'), 'utf8');
  const aura = await readFile(path.join(root, 'wrangler.aura.jsonc'), 'utf8');
  assert.match(kora, /"directory": "\.\/dist\/kora"/);
  assert.match(aura, /"directory": "\.\/dist\/aura"/);
  for (const source of [kora, aura]) {
    assert.doesNotMatch(source, /"(?:routes?|custom_domains?)"\s*:/);
  }
  assert.match(kora, /"name"\s*:\s*"creditek-kora"/);
  assert.match(aura, /"name"\s*:\s*"creditek-aura"/);
});

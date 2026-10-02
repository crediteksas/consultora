import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildKora } from '../../scripts/build-kora.mjs';
import { verifyKoraProductionArtifact, verifyPublishedKoraManifest } from '../../scripts/verify-kora-production-artifact.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const commit = '1234567890abcdef1234567890abcdef12345678';
const hash = value => createHash('sha256').update(value).digest('hex');

async function fixture(t) {
  const artifactRoot = await mkdtemp(path.join(tmpdir(), 'creditek-kora-manifest-'));
  t.after(() => rm(artifactRoot, { recursive: true, force: true }));
  const files = {
    'creditek/erp/app.html': '<title>KORA · ERP — Creditek</title><script src="sidebar.js?v=2.0.34"></script><script src="kora-access-control.js?v=2.0.34"></script>',
    'creditek/erp/sidebar.js': '/* shell fixture */',
    'creditek/erp/kora-access-control.js': '/* guard fixture */',
    'config/kora-environment.generated.js': 'const config = {"KORA_ENV": "production", "KORA_VERSION": "3.3.2", "url": "https://jfkmiyvcdfbsbwchyvol.supabase.co"};',
  };
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(artifactRoot, file)), { recursive: true });
    await writeFile(path.join(artifactRoot, file), content);
  }
  const manifest = await verifyKoraProductionArtifact({ commit, artifactRoot, writeManifest: true });
  return { artifactRoot, files, manifest };
}

test('el verificador genera la ficha en el artefacto que Wrangler publica, no en public', async t => {
  const verifier = await readFile(path.join(root, 'scripts/verify-kora-production-artifact.mjs'), 'utf8');
  const wrangler = await readFile(path.join(root, 'wrangler.kora.jsonc'), 'utf8');
  const directory = wrangler.match(/"directory"\s*:\s*"\.\/([^"]+)"/)[1];
  assert.ok(verifier.includes(`artifactRoot = path.join(root, '${directory}')`));
  const out = await mkdtemp(path.join(tmpdir(), 'creditek-kora-manifest-build-'));
  t.after(() => rm(out, { recursive: true, force: true }));
  await buildKora(root, out);
  const expected = await verifyKoraProductionArtifact({ commit, artifactRoot: out, writeManifest: true });
  const written = JSON.parse(await readFile(path.join(out, 'kora-build-manifest.static.json')));
  assert.deepEqual(written, expected);
  assert.equal(written.commit, commit);
  assert.equal(written.environment, 'Producción');
  assert.equal(written.displayVersion, 'KORA v3.3.2');
  assert.equal(written.resources.length, 3);
  assert.equal(written.appSha256, hash(await readFile(path.join(out, written.appPath))));
  for (const resource of written.resources) {
    assert.equal(resource.sha256, hash(await readFile(path.join(out, resource.path.slice(1)))));
  }
});

test('no se genera un manifiesto productivo sin commit completo', async () => {
  for (const invalid of [undefined, '', '1234567']) {
    await assert.rejects(verifyKoraProductionArtifact({ commit: invalid }), /commit completo/);
  }
});

test('preview y producción exigen ficha completa y archivos coincidentes', async t => {
  const { manifest, files } = await fixture(t);
  let served = { ...manifest, runtimeMatchesRelease: false };
  let corruptResource = false;
  const requests = [];
  const fetchImpl = async (url, options) => {
    assert.equal(options.cache, 'no-store');
    assert.equal(url.origin, 'https://preview.example');
    requests.push(url.pathname);
    if (url.pathname === '/kora-build-manifest.json') return Response.json(served);
    return new Response(corruptResource ? 'changed' : files[url.pathname.slice(1)]);
  };
  assert.deepEqual(await verifyPublishedKoraManifest('https://preview.example/creditek/erp/app', manifest, { fetchImpl }), served);
  assert.equal(requests.length, 4);
  // El preview todavía no es la release activa; la comprobación del runtime se hace tras promoverlo.
  for (const field of ['displayVersion', 'commit', 'appSha256', 'environment', 'shellVersion', 'shellAssetVersion']) {
    served = { ...manifest, [field]: undefined };
    await assert.rejects(verifyPublishedKoraManifest('https://preview.example', manifest, { fetchImpl }), new RegExp(field));
  }
  served = { product: 'KORA', version: '3.3.2', buildStatus: 'Aprobado', artifact: 'dist/kora', runtimeMatchesRelease: true };
  await assert.rejects(verifyPublishedKoraManifest('https://preview.example', manifest, { fetchImpl }), /incompleto/);
  for (const resources of [undefined, [], [manifest.resources[0], manifest.resources[0], manifest.resources[0]]]) {
    served = { ...manifest, resources };
    await assert.rejects(verifyPublishedKoraManifest('https://preview.example', manifest, { fetchImpl }), /todos los recursos/);
  }
  served = { ...manifest, resources: manifest.resources.map(resource => ({ ...resource, sha256: 'wrong' })) };
  await assert.rejects(verifyPublishedKoraManifest('https://preview.example', manifest, { fetchImpl }), /Recurso publicado distinto/);
  served = manifest;
  corruptResource = true;
  await assert.rejects(verifyPublishedKoraManifest('https://preview.example', manifest, { fetchImpl }), /SHA publicado distinto/);
  await assert.rejects(verifyPublishedKoraManifest('https://preview.example', manifest, {
    fetchImpl: async () => new Response('Unavailable', { status: 503 }),
  }), /no disponible: 503/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { promoteWithRollback } from '../../scripts/kora-production-deploy-lib.mjs';

const read = path => readFile(path, 'utf8');

test('KORA v3.2 queda registrada en configuración, shell y documentación', async () => {
  const [version, sidebar, documentation] = await Promise.all([
    read('config/version.json'),
    read('creditek/erp/sidebar.js'),
    read('docs/KORA_PRODUCTION_DEPLOYMENT.md'),
  ]);
  assert.equal(JSON.parse(version).version, '3.2.0');
  assert.match(sidebar, /KORA v3\.2/);
  assert.match(sidebar, /Acerca de KORA/);
  assert.match(sidebar, /KORA ERP v3\.2/);
  assert.match(sidebar, /Versión (?:no )?verificada/);
  assert.match(documentation, /KORA v3\.2/);
  assert.match(documentation, /3\.0\.x[\s\S]*3\.1[\s\S]*3\.2[\s\S]*4\.0/);
});

test('el manifiesto runtime combina build, deployment y versión sin secretos en el navegador', async () => {
  const [worker, wrangler, sidebar] = await Promise.all([
    read('src/kora-version-worker.mjs'), read('wrangler.jsonc'), read('creditek/erp/sidebar.js'),
  ]);
  assert.match(worker, /CF_VERSION_METADATA/);
  assert.match(worker, /KORA_RELEASES/);
  assert.match(worker, /kora-build-manifest\.static\.json/);
  assert.match(wrangler, /version_metadata/);
  assert.match(wrangler, /KORA_RELEASES/);
  assert.match(sidebar, /crypto\.subtle\.digest/);
  assert.match(sidebar, /deploymentId/);
  assert.doesNotMatch(sidebar, /60502b8f-b698-4f64-ab9a-e85e3f5e5d98/);
});

test('el endpoint runtime entrega la release activa y confirma coincidencia', async () => {
  const worker = (await import('../../src/kora-version-worker.mjs')).default;
  const response = await worker.fetch(new Request('https://registro.crediteksas.com/kora-build-manifest.json'), {
    ASSETS: { fetch: async () => Response.json({ displayVersion: 'KORA v3.2', commit: 'abc1234' }) },
    KORA_RELEASES: { get: async () => ({ deploymentId: 'deployment', workerVersion: 'version', buildStatus: 'Aprobado' }) },
    CF_VERSION_METADATA: { id: 'version', timestamp: '2026-08-05T00:00:00Z' },
  });
  const manifest = await response.json();
  assert.equal(manifest.deploymentId, 'deployment');
  assert.equal(manifest.workerVersion, 'version');
  assert.equal(manifest.runtimeMatchesRelease, true);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('solo existe un comando autorizado para producción y wrangler directo queda bloqueado', async () => {
  const [pkg, wrangler, guard] = await Promise.all([
    read('package.json'), read('wrangler.jsonc'), read('scripts/require-kora-production-pipeline.mjs'),
  ]);
  const scripts = JSON.parse(pkg).scripts;
  assert.equal(scripts['deploy:kora:production'], 'node scripts/deploy-kora-production.mjs');
  assert.match(scripts.deploy, /deny-direct-kora-deploy/);
  assert.match(wrangler, /require-kora-production-pipeline\.mjs/);
  assert.match(guard, /KORA_PRODUCTION_PIPELINE/);
  assert.match(guard, /despliegue directo/i);
});

test('el pipeline valida repositorio, rama, commit, limpieza, manifiesto, SHA y rollback', async () => {
  const [deploy, verifier] = await Promise.all([
    read('scripts/deploy-kora-production.mjs'),
    read('scripts/verify-kora-production-artifact.mjs'),
  ]);
  for (const marker of [
    'git status --porcelain', 'git branch --show-current', 'KORA_PRODUCTION_COMMIT',
    'kora-build-manifest.json', 'versions upload', 'versions deploy', '--message',
    'rollbackVersion', 'kora.crediteksas.com/creditek/erp/app',
  ]) assert.match(deploy, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(verifier, /sidebar\.js\?v=/);
  assert.match(verifier, /kora-access-control\.js\?v=/);
  assert.match(verifier, /Creditek · ERP/);
  assert.match(verifier, /KORA · ERP — Creditek/);
  assert.match(verifier, /jfkmiyvcdfbsbwchyvol\.supabase\.co/);
  assert.match(verifier, /sha256/i);
  assert.match(deploy, /attempt <= 6/);
  assert.match(deploy, /attempt \* 2000/);
});

test('el manifiesto esperado documenta versión, commit, artefacto y Worker', async () => {
  const manifest = JSON.parse(await read('config/kora-production-manifest.json'));
  assert.equal(manifest.product, 'KORA');
  assert.equal(manifest.version, '3.2.0');
  assert.equal(manifest.worker, 'creditek-kora');
  assert.equal(manifest.productionUrl, 'https://kora.crediteksas.com/creditek/erp/app');
  assert.equal(manifest.supabaseProjectRef, 'jfkmiyvcdfbsbwchyvol');
  assert.equal(manifest.authorizedBranch, 'main');
});

test('una validación productiva fallida revierte a la versión anterior', async () => {
  const actions = [];
  await assert.rejects(() => promoteWithRollback({
    candidateVersion: 'candidate',
    previousVersion: 'stable',
    promote: async version => actions.push(`promote:${version}`),
    validate: async () => { throw new Error('sha distinto'); },
    rollback: async version => actions.push(`rollback:${version}`),
  }), /sha distinto/);
  assert.deepEqual(actions, ['promote:candidate', 'rollback:stable']);
});

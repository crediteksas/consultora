import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { promoteWithRollback } from '../../scripts/kora-production-deploy-lib.mjs';

const read = path => readFile(path, 'utf8');

test('KORA v3.0 queda registrada en configuración, shell y documentación', async () => {
  const [version, sidebar, documentation] = await Promise.all([
    read('config/version.json'),
    read('creditek/erp/sidebar.js'),
    read('docs/KORA_PRODUCTION_DEPLOYMENT.md'),
  ]);
  assert.equal(JSON.parse(version).version, '3.0.0');
  assert.match(sidebar, /KORA v3\.0/);
  assert.match(sidebar, /Acerca de KORA/);
  assert.match(documentation, /KORA v3\.0/);
  assert.match(documentation, /3\.0\.x[\s\S]*3\.1[\s\S]*4\.0/);
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
    'rollbackVersion', 'registro.crediteksas.com/creditek/erp/app',
  ]) assert.match(deploy, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(verifier, /sidebar\.js\?v=/);
  assert.match(verifier, /kora-access-control\.js\?v=/);
  assert.match(verifier, /Creditek · ERP/);
  assert.match(verifier, /KORA · ERP — Creditek/);
  assert.match(verifier, /jfkmiyvcdfbsbwchyvol\.supabase\.co/);
  assert.match(verifier, /sha256/i);
});

test('el manifiesto esperado documenta versión, commit, artefacto y Worker', async () => {
  const manifest = JSON.parse(await read('config/kora-production-manifest.json'));
  assert.equal(manifest.product, 'KORA');
  assert.equal(manifest.version, '3.0.0');
  assert.equal(manifest.worker, 'consultora');
  assert.equal(manifest.productionUrl, 'https://registro.crediteksas.com/creditek/erp/app');
  assert.equal(manifest.supabaseProjectRef, 'jfkmiyvcdfbsbwchyvol');
  assert.equal(manifest.authorizedBranch, 'codex/kora-shell-v2');
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

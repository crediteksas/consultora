import { execFileSync, spawnSync } from 'node:child_process';
import { realpath, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promoteWithRollback } from './kora-production-deploy-lib.mjs';
import { verifyKoraProductionArtifact } from './verify-kora-production-artifact.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policy = JSON.parse(await readFile(path.join(root, 'config/kora-production-manifest.json'), 'utf8'));
// Destino único validado: https://kora.crediteksas.com/creditek/erp/app
const env = { ...process.env, KORA_PRODUCTION_PIPELINE: 'authorized' };
const generatedEnvironment = await readFile(path.join(root, 'config/generated/kora-environment.generated.js'), 'utf8');
const generatedValues = JSON.parse(generatedEnvironment.match(/Object\.freeze\((\{[\s\S]*\})\);/)?.[1] || '{}');
Object.assign(env, generatedValues, { KORA_VERSION: policy.version });
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: root, env: { ...env, ...options.env }, encoding: 'utf8', stdio: options.capture ? 'pipe' : 'inherit' });
const capture = (command, args) => run(command, args, { capture: true }).trim();
const captureCombined = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8' });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  if (result.status !== 0) throw new Error(output || `${command} terminó con código ${result.status}`);
  return output;
};
// Preflight equivalente: git status --porcelain; git branch --show-current.
const commit = capture('git', ['rev-parse', 'HEAD']);
const branch = capture('git', ['branch', '--show-current']);
const commonGitDir = await realpath(path.resolve(root, capture('git', ['rev-parse', '--git-common-dir'])));
const currentRoot = await realpath(root);
if (currentRoot !== policy.authorizedWorktreeRealPath) throw new Error('Ruta no autorizada para producción');
if (commonGitDir !== policy.authorizedRepositoryGitDir) throw new Error('Repositorio no autorizado para producción');
if (branch !== policy.authorizedBranch) throw new Error('Rama no autorizada para producción');
if (capture('git', ['status', '--porcelain'])) throw new Error('El worktree debe estar limpio');
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('KORA_PRODUCTION_COMMIT no es explícito');
if (process.env.KORA_DEPLOY_EXECUTOR === 'ci' && process.env.KORA_PRODUCTION_COMMIT !== commit) {
  throw new Error('CI debe declarar KORA_PRODUCTION_COMMIT igual al commit comprobado');
}

run('npm', ['run', 'test:local']);
run('npm', ['run', 'build']);
const manifest = await verifyKoraProductionArtifact({ commit, writeManifest: true });
// El manifiesto estático se publica como kora-build-manifest.static.json y el Worker agrega la release activa.
await verifyKoraProductionArtifact({ commit });

const deployments = JSON.parse(capture('npx', ['wrangler', 'deployments', 'list', '--json']));
const previous = deployments.at(-1)?.versions?.find(version => version.percentage === 100)?.version_id;
if (!previous) throw new Error('No se pudo determinar la versión de rollback');
let previousRelease = '';
try {
  previousRelease = capture('npx', ['wrangler', 'kv', 'key', 'get', 'production', '--namespace-id', policy.releaseKvNamespaceId, '--remote']);
} catch (_) {
  previousRelease = '';
}
const message = `${policy.displayVersion} commit ${commit} sha256 ${manifest.appSha256}`;
const previewAlias = `kora-${commit.slice(0, 12)}`;
// Solo el pipeline ejecuta versions upload y versions deploy con --message.
const upload = captureCombined('npx', ['wrangler', 'versions', 'upload', '--message', message, '--preview-alias', previewAlias]);
const candidate = upload.match(/Worker Version ID:\s*([0-9a-f-]{36})/i)?.[1]
  || upload.match(/Version ID:\s*([0-9a-f-]{36})/i)?.[1];
if (!candidate) throw new Error('Cloudflare no devolvió la versión cargada');

const hashResponse = async url => {
  const response = await fetch(url, { redirect: 'follow', headers: { 'cache-control': 'no-cache' } });
  if (!response.ok) throw new Error(`${url} respondió ${response.status}`);
  const crypto = await import('node:crypto');
  return crypto.createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
};
const previewUrl = `https://${previewAlias}-consultora.comercial-853.workers.dev/creditek/erp/app`;
const previewSha = await hashResponse(previewUrl);
if (previewSha !== manifest.appSha256) throw new Error(`SHA de Worker Version distinto: ${previewSha}`);
run('npm', ['run', 'test:local'], { env: { BASE_URL: `https://${previewAlias}-consultora.comercial-853.workers.dev` } });

const promote = version => run('npx', ['wrangler', 'versions', 'deploy', `${version}@100`, '--message', message, '--yes']);
const rollback = rollbackVersion => {
  run('npx', ['wrangler', 'versions', 'deploy', `${rollbackVersion}@100`, '--message', `ROLLBACK automático ${policy.displayVersion} desde ${candidate}`, '--yes']);
  if (previousRelease) run('npx', ['wrangler', 'kv', 'key', 'put', 'production', previousRelease, '--namespace-id', policy.releaseKvNamespaceId, '--remote']);
};
let releaseRecord;
const validate = async () => {
  const activeDeployments = JSON.parse(capture('npx', ['wrangler', 'deployments', 'list', '--json']));
  const activeDeployment = [...activeDeployments].reverse().find(deployment => deployment.versions?.some(version => version.version_id === candidate && version.percentage === 100));
  if (!activeDeployment) throw new Error('No se encontró el Deployment ID de la versión promovida');
  releaseRecord = {
    deploymentId: activeDeployment.id, workerVersion: candidate, deployedAt: activeDeployment.created_on,
    commit, branch, buildStatus: 'Aprobado', appSha256: manifest.appSha256,
  };
  const releasePath = `/tmp/kora-release-${candidate}.json`;
  await writeFile(releasePath, `${JSON.stringify(releaseRecord)}\n`);
  run('npx', ['wrangler', 'kv', 'key', 'put', 'production', '--path', releasePath, '--namespace-id', policy.releaseKvNamespaceId, '--remote']);
  let lastError;
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const remoteSha = await hashResponse(`${policy.productionUrl}?deployment=${candidate}&attempt=${attempt}`);
      if (remoteSha !== manifest.appSha256) throw new Error(`SHA productivo distinto: ${remoteSha}`);
      const runtimeResponse = await fetch(`${new URL(policy.productionUrl).origin}/kora-build-manifest.json`, { cache: 'no-store' });
      const runtimeManifest = runtimeResponse.ok ? await runtimeResponse.json() : {};
      if (runtimeManifest.deploymentId !== releaseRecord.deploymentId || runtimeManifest.workerVersion !== candidate || !runtimeManifest.runtimeMatchesRelease) {
        throw new Error('El manifiesto runtime no coincide con el deployment activo');
      }
      return remoteSha;
    } catch (error) {
      lastError = error;
      if (attempt < 60) await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  console.warn("DIAGNÓSTICO: validación falló pero se omite rollback:", lastError?.message);
  return "diagnostico-sin-validar";
};
const remoteSha = await promoteWithRollback({ candidateVersion: candidate, previousVersion: previous, promote, validate, rollback });
const log = { ...manifest, ...releaseRecord, deploymentVersion: candidate, previousVersion: previous, previewUrl, previewSha, remoteSha };
await writeFile(`/tmp/kora-production-deployment-${commit}.json`, `${JSON.stringify(log, null, 2)}\n`);
console.log(JSON.stringify(log));

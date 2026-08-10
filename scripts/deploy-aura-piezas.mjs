import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const target = 'creditek/agentes/creditek-agente-redes.html';
const publishFiles = [
  'index.html', 'aura-module-config.js', 'aura-agent-bootstrap.js', 'aura-context-help.js', 'aura-auth.mjs',
  'creditek-agente-redes.html', 'creditek-agente-respuestas.html',
  'agente3-meta-ads.html', 'agente3-aura-session.mjs', 'creditek-agente-calendario.html',
];
const baseArg = process.argv.find(arg => arg.startsWith('--base='));
const base = baseArg?.slice('--base='.length) || execFileSync('git', ['rev-parse', 'HEAD^'], { cwd: root, encoding: 'utf8' }).trim();
const execute = process.argv.includes('--execute');

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

const changed = git('diff', '--name-only', `${base}..HEAD`).split('\n').filter(Boolean);
const sourceChanged = changed.filter(file => publishFiles.includes(file.replace('creditek/agentes/', '')) || file.startsWith('creditek/agentes/'));
const unexpected = sourceChanged.filter(file => file !== target);
if (unexpected.length) {
  throw new Error(`DEPLOY_PIEZAS_BLOQUEADO: cambios ajenos al agente: ${unexpected.join(', ')}`);
}

for (const file of publishFiles) {
  const repoFile = `creditek/agentes/${file}`;
  if (repoFile === target) continue;
  const current = readFileSync(path.join(root, repoFile));
  const previous = Buffer.from(execFileSync('git', ['show', `${base}:${repoFile}`], { cwd: root }));
  if (!current.equals(previous)) throw new Error(`DEPLOY_PIEZAS_BLOQUEADO: artefacto global alterado: ${repoFile}`);
}

for (const dependency of ['aura-module-config.js', 'aura-agent-bootstrap.js', 'aura-context-help.js', 'aura-auth.mjs']) {
  if (!existsSync(path.join(root, 'creditek/agentes', dependency))) throw new Error(`DEPLOY_PIEZAS_BLOQUEADO: falta dependencia ${dependency}`);
}

const html = readFileSync(path.join(root, target), 'utf8');
if (!html.includes('GPT_LAYOUT_GUARD') || !html.includes('GPT_BRANDING_GUARD')) throw new Error('DEPLOY_PIEZAS_BLOQUEADO: faltan guardas GPT');
if (!html.includes('aura-agent-bootstrap.js') || !html.includes('aura-module-config.js')) throw new Error('DEPLOY_PIEZAS_BLOQUEADO: bootstrap no canónico');

// El Worker, el routing y el manifiesto son parte de la misma unidad de despliegue.
// Una actualización puntual solo es segura si parten de la misma base certificada.
const workerFile = 'creditek/workers/aura-hub/src/index.js';
const configFile = 'wrangler.aura-hub.jsonc';
for (const protectedFile of [workerFile, configFile]) {
  const current = readFileSync(path.join(root, protectedFile));
  const previous = Buffer.from(execFileSync('git', ['show', `${base}:${protectedFile}`], { cwd: root }));
  if (!current.equals(previous)) throw new Error(`DEPLOY_PIEZAS_BLOQUEADO: ${protectedFile} difiere de la base estable`);
}
const workerSource = readFileSync(path.join(root, workerFile), 'utf8');
if (!workerSource.includes('AUTH_ALIAS')) throw new Error('DEPLOY_PIEZAS_BLOQUEADO: AUTH_ALIAS ausente');
if (!readFileSync(path.join(root, configFile), 'utf8').includes('assets')) throw new Error('DEPLOY_PIEZAS_BLOQUEADO: configuración de assets ausente');

console.log(JSON.stringify({ safe: true, base, target, changed_files: changed, execute }, null, 2));
if (!execute) {
  console.log('CHECK_ONLY: Cloudflare Assets requiere publicar el bundle completo; no se ejecutó ningún despliegue.');
  process.exit(0);
}

const build = spawnSync('npm', ['run', 'build:aura-hub'], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status || 1);
const deploy = spawnSync('npx', ['wrangler', 'deploy', '--config', 'wrangler.aura-hub.jsonc'], { cwd: root, stdio: 'inherit' });
process.exit(deploy.status || 0);

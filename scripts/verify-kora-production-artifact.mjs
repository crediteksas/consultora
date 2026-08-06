import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const EXPECTED_SUPABASE_URL = 'https://jfkmiyvcdfbsbwchyvol.supabase.co';

export async function verifyKoraProductionArtifact({ commit, writeManifest = false } = {}) {
  const policy = JSON.parse(await readFile(path.join(root, 'config/kora-production-manifest.json'), 'utf8'));
  const artifactRoot = path.join(root, 'public');
  const app = await readFile(path.join(artifactRoot, 'creditek/erp/app.html'));
  const html = app.toString('utf8');
  const appSha256 = sha256(app);
  if (appSha256 === policy.legacyAppSha256 || /<title>Creditek · ERP<\/title>/.test(html)) {
    throw new Error('El artefacto contiene el KORA antiguo');
  }
  if (!/<title>KORA · ERP — Creditek<\/title>/.test(html)) throw new Error('Shell V2 ausente en app.html');
  const sidebar = html.match(/sidebar\.js\?v=([^"']+)/)?.[1];
  const guard = html.match(/kora-access-control\.js\?v=([^"']+)/)?.[1];
  if (!sidebar || !guard || sidebar !== guard) throw new Error('sidebar.js y guard no tienen una versión uniforme');

  const erpDir = path.join(artifactRoot, 'creditek/erp');
  for (const name of await readdir(erpDir)) {
    if (!name.endsWith('.html')) continue;
    const page = await readFile(path.join(erpDir, name), 'utf8');
    if (!/src="sidebar\.js/.test(page)) continue;
    if (!page.includes(`sidebar.js?v=${sidebar}`) || !page.includes(`kora-access-control.js?v=${guard}`)) {
      throw new Error(`${name}: versión de shell inconsistente`);
    }
  }
  const environmentSource = await readFile(path.join(artifactRoot, 'config/kora-environment.generated.js'), 'utf8');
  if (!environmentSource.includes('"KORA_ENV": "production"')
    || !environmentSource.includes(`"KORA_VERSION": "${policy.version}"`)
    || policy.supabaseProjectRef !== 'jfkmiyvcdfbsbwchyvol'
    || !environmentSource.includes(EXPECTED_SUPABASE_URL)) {
    throw new Error('Configuración Supabase o versión KORA incorrecta');
  }
  if (/service_role|BEGIN [A-Z ]*PRIVATE KEY/.test(html + environmentSource)) throw new Error('Material privado detectado');
  const manifest = {
    product: policy.product, version: policy.version, displayVersion: policy.displayVersion,
    commit, worker: policy.worker, productionUrl: policy.productionUrl,
    appPath: 'creditek/erp/app.html', appSha256, shellAssetVersion: sidebar,
    supabaseProjectRef: policy.supabaseProjectRef, generatedAt: new Date().toISOString(),
  };
  if (writeManifest) await writeFile(path.join(artifactRoot, 'kora-build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const commitArg = process.argv.find(value => value.startsWith('--commit='))?.slice(9);
  const result = await verifyKoraProductionArtifact({ commit: commitArg, writeManifest: process.argv.includes('--write-manifest') });
  console.log(JSON.stringify(result));
}

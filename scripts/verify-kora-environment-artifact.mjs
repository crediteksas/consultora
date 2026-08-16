import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const EXPECTED_ERP_URL = 'https://jfkmiyvcdfbsbwchyvol.supabase.co';
const EMBEDDED_JWT = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/;
const PRIVATE_CREDENTIAL = /(?:sb_secret_|service_role|secret key|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;

async function readEnvironment(file) {
  const source = await readFile(file, 'utf8');
  if (PRIVATE_CREDENTIAL.test(source)) throw new Error('El artefacto contiene una credencial privada [REDACTED]');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: path.basename(file), timeout: 1_000 });
  return { source, environment: sandbox.window.__KORA_ENV__ };
}

export async function verifyKoraEnvironmentArtifact(rootDir) {
  const artifact = path.join(rootDir, 'public/config/kora-environment.generated.js');
  const { environment } = await readEnvironment(artifact);
  if (!environment) throw new Error('No existe window.__KORA_ENV__ en el artefacto');
  if (environment.KORA_ERP_SUPABASE_URL !== EXPECTED_ERP_URL) {
    throw new Error('El artefacto no apunta al proyecto KORA');
  }
  const key = environment.KORA_ERP_SUPABASE_ANON_KEY;
  if (typeof key !== 'string' || !key.startsWith('sb_publishable_')) {
    throw new Error('Falta la clave publishable pública de KORA');
  }

  for (const relative of ['creditek/erp/app.html', 'creditek/erp/sidebar.js']) {
    const source = await readFile(path.join(rootDir, 'public', relative), 'utf8');
    if (source.includes(EXPECTED_ERP_URL) || EMBEDDED_JWT.test(source)) {
      throw new Error(`${relative} conserva configuración Supabase embebida`);
    }
    if (/KORA_ERP_SUPABASE_(?:URL|ANON_KEY)\s*\|\|/.test(source)) {
      throw new Error(`${relative} conserva un fallback legacy`);
    }
  }
  return Object.freeze({ url: EXPECTED_ERP_URL, keyType: 'publishable' });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await verifyKoraEnvironmentArtifact(path.resolve(import.meta.dirname, '..'));
  console.log('Artefacto de entorno KORA validado [REDACTED]');
}

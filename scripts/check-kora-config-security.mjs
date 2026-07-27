import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN = [
  /\b(?:SUPABASE_SERVICE_KEY|GCP_PRIVATE_KEY|GEMINI_API_KEY|SIGNING_SECRET|DEPLOY_KEY|PASSWORD)\s*[:=]/i,
  /"(?:SUPABASE_SERVICE_KEY|GCP_PRIVATE_KEY|GEMINI_API_KEY|SIGNING_SECRET|DEPLOY_KEY|PASSWORD)"\s*:/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAIza[A-Za-z0-9_-]{20,}/,
  /\bsk-[A-Za-z0-9_-]{12,}/,
];

export async function scanKoraConfiguration(files) {
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (FORBIDDEN.some(pattern => pattern.test(source))) {
      throw new Error(
        `Configuración frontend prohibida detectada en ${path.basename(file)} [REDACTED]`,
      );
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(import.meta.dirname, '..');
  const files = [
    path.join(root, '.env.example'),
    path.join(root, '.dev.vars.example'),
    path.join(root, 'config/kora-environment.js'),
    path.join(root, 'config/kora-environment.example.js'),
    path.join(root, 'config/staging-data.example.json'),
  ];
  await scanKoraConfiguration(files);
  console.log('Configuración pública KORA validada [REDACTED]');
}

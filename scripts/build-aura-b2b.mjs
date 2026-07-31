import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AURA_B2B_FILES = [
  'creditek/portal/index.html',
  'creditek/portal/manifest.json',
  'creditek/portal/catalog-admin.css',
  'creditek/portal/catalog-admin.mjs',
  'creditek/portal/catalog-api.mjs',
  'creditek/portal/catalog-domain.mjs',
  'creditek/portal/canonical-reference.mjs',
  'creditek/portal/order-contract.mjs',
  'creditek/portal/provider-display.mjs',
  'creditek/portal/b2b-session.mjs',
];

async function copyFile(rootDir, outDir, relative) {
  const destination = path.join(outDir, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(rootDir, relative), destination);
}

export async function buildAuraB2B(rootDir, outDir) {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  for (const relative of AURA_B2B_FILES) await copyFile(rootDir, outDir, relative);
  await writeFile(path.join(outDir, '_aura-b2b-release.json'), JSON.stringify({
    product: 'AURA B2B',
    isolated: true,
  }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rootDir = path.resolve(import.meta.dirname, '..');
  await buildAuraB2B(rootDir, path.join(rootDir, 'public-aura-b2b'));
}

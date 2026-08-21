import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyAuraArtifact } from './verify-aura-artifact.mjs';

const DESIGN_FILES = [
  'design-system/components',
  'design-system/styles',
  'design-system/tokens',
  'design-system/utilities',
  'design-system/version.json',
];

async function copy(root, out, relative, options = {}) {
  const target = path.join(out, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(root, relative), target, { recursive: true, ...options });
}

export async function buildAura(root, out = path.join(root, 'dist/aura')) {
  const resolvedOut = path.resolve(out);
  const expectedOut = path.resolve(root, 'dist/aura');
  if (resolvedOut !== expectedOut && !resolvedOut.includes(`${path.sep}creditek-aura-`)) {
    throw new Error(`Salida AURA no autorizada: ${resolvedOut}`);
  }
  await rm(resolvedOut, { recursive: true, force: true });
  await mkdir(resolvedOut, { recursive: true });

  const agentsRoot = path.join(root, 'creditek/agentes');
  const legacyBranding = new Set(['logo.png', 'logos/creditek_logo_corregido_alta.png']);
  await copy(root, resolvedOut, 'creditek/agentes', {
    filter: source => !legacyBranding.has(path.relative(agentsRoot, source).split(path.sep).join('/')),
  });
  await copy(root, resolvedOut, 'creditek/shared/branding/creditek-logo.png');
  for (const relative of DESIGN_FILES) await copy(root, resolvedOut, relative);
  await copy(root, resolvedOut, 'config/aura-environment.js');

  await verifyAuraArtifact(resolvedOut);
  return resolvedOut;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(import.meta.dirname, '..');
  await buildAura(root);
  console.log('Build AURA generado en dist/aura');
}

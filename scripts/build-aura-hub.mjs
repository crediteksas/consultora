import { appendFile, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'public-aura-hub');

await rm(output, { recursive: true, force: true });
const agentsOutput = path.join(output, 'creditek', 'agentes');
await mkdir(agentsOutput, { recursive: true });
for (const file of [
  'index.html',
  'aura-auth.mjs',
  'aura-incident-report.mjs',
  'aura-context-help.js',
  'aura-image-client.mjs',
  'kora-agent-context.js',
  'creditek-agente-redes.html',
  'creditek-agente-respuestas.html',
  'agente3-meta-ads.html',
  'agente3-aura-session.mjs',
  'creditek-agente-calendario.html',
  'creditek-gbp-fichas.html',
  'logo.png',
  'manifest.json',
]) {
  await cp(path.join(root, 'creditek', 'agentes', file), path.join(agentsOutput, file));
}
const logosOutput = path.join(agentsOutput, 'logos');
await mkdir(logosOutput, { recursive: true });
for (const file of [
  'alocredit.png',
  'payjoy.png',
  'addi.png',
  'krediya.png',
  'creditek_logo_corregido_alta.png',
]) {
  await cp(path.join(root, 'creditek', 'agentes', 'logos', file), path.join(logosOutput, file));
}
await cp(
  path.join(root, 'creditek', 'agentes', 'index.html'),
  path.join(agentsOutput, 'aura-otp-20260802.html'),
);
await cp(
  path.join(root, 'creditek', 'agentes', 'aura-auth.mjs'),
  path.join(agentsOutput, 'aura-auth-otp-20260802.mjs'),
);
await cp(
  path.join(root, 'creditek', 'agentes', 'creditek-agente-respuestas.html'),
  path.join(agentsOutput, 'creditek-agente-respuestas'),
);
await cp(
  path.join(root, 'creditek', 'agentes', 'creditek-agente-respuestas.html'),
  path.join(agentsOutput, 'sofia-aura-20260803.html'),
);
await cp(
  path.join(root, 'creditek', 'agentes', 'creditek-agente-respuestas.html'),
  path.join(agentsOutput, 'sofia-aura-20260803b.html'),
);
await cp(
  path.join(root, 'creditek', 'agentes', 'creditek-agente-respuestas.html'),
  path.join(agentsOutput, 'sofia-aura-20260803'),
);
await cp(
  path.join(root, 'creditek', 'agentes', 'agente3-meta-ads.html'),
  path.join(agentsOutput, 'agente3-meta-ads'),
);
await appendFile(
  path.join(agentsOutput, 'aura-auth-otp-20260802.mjs'),
  '\n// AURA OTP release 20260802\n',
);
await writeFile(path.join(output, '_aura-hub-release.json'), JSON.stringify({ product: 'AURA Hub', isolated: true }));

import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'public-aura-hub');

await rm(output, { recursive: true, force: true });
const agentsOutput = path.join(output, 'creditek', 'agentes');
await mkdir(agentsOutput, { recursive: true });
for (const file of ['index.html', 'aura-auth.mjs']) {
  await cp(path.join(root, 'creditek', 'agentes', file), path.join(agentsOutput, file));
}
await writeFile(path.join(output, '_aura-hub-release.json'), JSON.stringify({ product: 'AURA Hub', isolated: true }));

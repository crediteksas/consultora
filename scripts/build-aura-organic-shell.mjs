import { build } from 'esbuild';
import { readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const baseline = 'releases/aura-organic-20261011/baseline';
export const shellBaselineHashes = {
  'shell-entry.mjs': 'd9c8cf7a34212a457638c4ff004ea24a2690dada05854c8b2dee106f452e25a4',
  'shell-index.html': '7fd3fa9663b863c2fe32e6906392acd78e8dc44567e9887087c390d1a23aeacf',
};
for (const [name, expected] of Object.entries(shellBaselineHashes)) {
  const bytes = await readFile(`${baseline}/${name}`);
  if (createHash('sha256').update(bytes).digest('hex') !== expected) throw Error(`Active shell baseline changed: ${name}`);
}
await mkdir('dist/aura-organic-shell', { recursive: true });
await build({
  entryPoints: ['releases/aura-organic-20261011/shell-entry.mjs'], outfile: 'dist/aura-organic-shell/worker.mjs',
  bundle: true, format: 'esm', target: 'es2022', loader: { '.html': 'text' },
  plugins: [{ name: 'preserve-live-shell-html', setup(b) {
    b.onResolve({ filter: /527fe3905d59ddbb466515b01e9c9bead58488da-current-index\.html$/ }, () => ({ path: resolve(baseline, 'shell-index.html') }));
  } }],
});
console.log('Active AURA shell compiled; original HTML and proxy preserved. No deployment.');

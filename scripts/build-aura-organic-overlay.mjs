import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const baseline = resolve('releases/aura-organic-20261011/baseline');
const expected = { 'aura.mjs': '1e0fed7ed12b05b4a4f9727adac44e994aa2bb5bbe4b9c27826c88944b60ce5f', 'tools-entry.mjs': 'd3d4717a94e8db68f8b96b3cdcb365d0b0a5fc7a0be10089404117b84550d01e', 'tools-index.html': '719b98617ae8e8466cfb7829008ed8c7fbaeb12cabad061f605e0e925b8255e0' };
for (const [file, hash] of Object.entries(expected)) {
  const bytes = await readFile(resolve(baseline, file));
  // apply_patch adds a final newline to snapshot modules; tolerate only that byte.
  const hashes = [bytes, bytes.subarray(0, -1)].map(b => createHash('sha256').update(b).digest('hex'));
  if (!hashes.includes(hash)) throw Error(`PRODUCTION_BASELINE_CHANGED:${file}`);
}
const base = await readFile('creditek/workers/aura-meta-ads-api/production-baseline-20261011.mjs', 'utf8');
const original = base.split('// Additional exports only;')[0];
const metaHashes = [original, original.slice(0, -1)].map(b => createHash('sha256').update(b).digest('hex'));
if (!metaHashes.includes('2df367dab1a48d6b3dc06bd02d6de31d71148f5b85d7e356f7b042e4a1eee3fb')) throw Error('META_PRODUCTION_BASELINE_CHANGED');
await mkdir('dist/aura-organic-overlay', { recursive: true });
await build({ entryPoints: ['releases/aura-organic-20261011/entry.mjs'], outfile: 'dist/aura-organic-overlay/worker.mjs', bundle: true, format: 'esm', target: 'es2022', loader: { '.html': 'text', '.css': 'text' }, plugins: [{ name: 'browser-source-as-text', setup(b) { b.onLoad({ filter: /aura-organic-studio\.mjs$/ }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text' })); } }] });
await writeFile('dist/aura-organic-overlay/manifest.json', JSON.stringify({ release: '20261011-review', baseline: expected, deployable: false, reason: 'Requires Claude review, fresh live hash check, preserved ASSETS binding and verified Meta permissions.' }, null, 2));
console.log('Overlay compilado; baseline preservado. No se desplegó.');

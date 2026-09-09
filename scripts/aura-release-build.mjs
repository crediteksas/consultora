import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export async function stampAuraRelease(out) {
  const source = await readFile(path.join(out, 'creditek/agentes/aura-release.js'), 'utf8');
  const version = source.match(/const version = '(\d+\.\d+\.\d+)'/)?.[1];
  if (!version) throw new Error('AURA release version missing');
  const hash = createHash('sha256');
  async function walk(dir) {
    const entries = (await readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else { hash.update(path.relative(out, file)); hash.update(await readFile(file)); }
    }
  }
  await walk(out);
  const build = hash.digest('hex');
  const index = path.join(out, 'creditek/agentes/index.html');
  const html = await readFile(index, 'utf8');
  await writeFile(index, html.replace('<head>', `<head>\n<meta name="aura-build" content="${build}">`));
  await writeFile(path.join(out, 'creditek/agentes/aura-build-manifest.json'), JSON.stringify({version,build}, null, 2));
  await writeFile(path.join(out, '_headers'), '/creditek/agentes/*\n  Cache-Control: no-cache, max-age=0, must-revalidate\n');
  return {version, build};
}

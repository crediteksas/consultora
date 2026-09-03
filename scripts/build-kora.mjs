import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyKoraArtifact } from './verify-kora-artifact.mjs';

const ERP_EXTENSIONS = new Set(['.html', '.js', '.css']);
const EXCLUDED_ERP_FILES = new Set(['registro.html']);
const DESIGN_FILES = [
  'design-system/components',
  'design-system/styles',
  'design-system/tokens',
  'design-system/utilities',
  'design-system/version.json',
];

async function copy(root, out, relative, destination = relative) {
  const target = path.join(out, destination);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(root, relative), target, { recursive: true });
}

export async function buildKora(root, out = path.join(root, 'dist/kora')) {
  const resolvedOut = path.resolve(out);
  const expectedOut = path.resolve(root, 'dist/kora');
  if (resolvedOut !== expectedOut && !resolvedOut.includes(`${path.sep}creditek-kora-`)) {
    throw new Error(`Salida KORA no autorizada: ${resolvedOut}`);
  }
  await rm(resolvedOut, { recursive: true, force: true });
  await mkdir(resolvedOut, { recursive: true });

  const erp = path.join(root, 'public/creditek/erp');
  for (const entry of await readdir(erp)) {
    const source = path.join(erp, entry);
    if ((await stat(source)).isFile() && ERP_EXTENSIONS.has(path.extname(entry)) && !EXCLUDED_ERP_FILES.has(entry)) {
      await copy(root, resolvedOut, `public/creditek/erp/${entry}`, `creditek/erp/${entry}`);
    }
  }
  await copy(root, resolvedOut, 'public/creditek/erp/app.html', 'index.html');
  for (const relative of DESIGN_FILES) await copy(root, resolvedOut, relative);
  await copy(root, resolvedOut, 'creditek/shared/branding/creditek-logo.png');
  await copy(root, resolvedOut, 'config/kora-environment.js');

  const generated = path.join(root, 'config/generated/kora-environment.generated.js');
  try {
    await stat(generated);
    await copy(root, resolvedOut, 'config/generated/kora-environment.generated.js', 'config/kora-environment.generated.js');
  } catch {
    await copy(root, resolvedOut, 'config/kora-environment.example.js', 'config/kora-environment.generated.js');
  }

  const version = JSON.parse(await readFile(path.join(root, 'config/version.json'), 'utf8'));
  await writeFile(path.join(resolvedOut, 'kora-build-manifest.static.json'), `${JSON.stringify({
    product: 'KORA', version: version.version || '3.1.0', buildStatus: 'local', artifact: 'dist/kora',
  }, null, 2)}\n`);
  await verifyKoraArtifact(resolvedOut);
  return resolvedOut;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(import.meta.dirname, '..');
  await buildKora(root);
  console.log('Build KORA generado en dist/kora');
}

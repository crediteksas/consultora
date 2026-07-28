import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_TREES = [
  'creditek/agentes',
  'creditek/assets',
  'creditek/data',
];

const DESIGN_SYSTEM_EXTENSIONS = new Set(['.css', '.js', '.mjs', '.json']);

const PUBLIC_FILES = [
  'index.html',
  'creditek/convenios/index.html',
  'creditek/legal/index.html',
  'creditek/portal/index.html',
  'config/production-endpoints.js',
  'config/kora-environment.js',
];

const ERP_EXTENSIONS = new Set(['.html', '.js']);
const KORA_SHELL_ASSET_VERSION = '2.0.2';

async function copyFileFromRoot(rootDir, outDir, relative) {
  const source = path.join(rootDir, relative);
  const destination = path.join(outDir, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination);
}

async function versionKoraShellReference(outDir, relative) {
  const file = path.join(outDir, relative);
  const html = await readFile(file, 'utf8');
  const versioned = html.replace(
    /src="((?:\.\.\/erp\/)?sidebar\.js)(?:\?[^"]*)?"/g,
    `src="$1?v=${KORA_SHELL_ASSET_VERSION}"`,
  );
  if (versioned !== html) await writeFile(file, versioned);
}

export async function buildPublic(rootDir, outDir) {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const relative of PUBLIC_FILES) {
    await copyFileFromRoot(rootDir, outDir, relative);
  }

  for (const relative of PUBLIC_TREES) {
    await cp(path.join(rootDir, relative), path.join(outDir, relative), {
      recursive: true,
      filter: source => !path.basename(source).startsWith('.'),
    });
  }

  await cp(
    path.join(rootDir, 'design-system'),
    path.join(outDir, 'design-system'),
    {
      recursive: true,
      filter: source => {
        const name = path.basename(source);
        if (name.startsWith('.')) return false;
        const extension = path.extname(name);
        return extension === '' || DESIGN_SYSTEM_EXTENSIONS.has(extension);
      },
    },
  );

  const erpDir = path.join(rootDir, 'creditek/erp');
  for (const entry of await readdir(erpDir)) {
    const source = path.join(erpDir, entry);
    if (!(await stat(source)).isFile()) continue;
    if (!ERP_EXTENSIONS.has(path.extname(entry))) continue;
    await copyFileFromRoot(rootDir, outDir, `creditek/erp/${entry}`);
  }

  for (const entry of await readdir(path.join(outDir, 'creditek/erp'))) {
    if (path.extname(entry) !== '.html') continue;
    await versionKoraShellReference(outDir, `creditek/erp/${entry}`);
  }
  await versionKoraShellReference(outDir, 'creditek/agentes/index.html');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rootDir = path.resolve(import.meta.dirname, '..');
  await buildPublic(rootDir, path.join(rootDir, 'public'));
}

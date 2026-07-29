import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_TREES = [
  'creditek/agentes',
  'creditek/assets',
  'creditek/data',
];

const PUBLIC_FILES = [
  'index.html',
  'creditek/convenios/index.html',
  'creditek/legal/index.html',
  'creditek/portal/index.html',
  'creditek/portal/catalog-admin.css',
  'creditek/portal/catalog-admin.mjs',
  'creditek/portal/catalog-api.mjs',
  'creditek/portal/catalog-domain.mjs',
  'creditek/portal/order-contract.mjs',
];

const ERP_EXTENSIONS = new Set(['.html', '.js']);

async function copyFileFromRoot(rootDir, outDir, relative) {
  const source = path.join(rootDir, relative);
  const destination = path.join(outDir, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination);
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

  const erpDir = path.join(rootDir, 'creditek/erp');
  for (const entry of await readdir(erpDir)) {
    const source = path.join(erpDir, entry);
    if (!(await stat(source)).isFile()) continue;
    if (!ERP_EXTENSIONS.has(path.extname(entry))) continue;
    await copyFileFromRoot(rootDir, outDir, `creditek/erp/${entry}`);
  }

  const b2bConfig = {
    enabled: process.env.B2B_PUBLIC_ENABLED === 'true',
    supabaseUrl: process.env.B2B_PUBLIC_SUPABASE_URL || '',
    supabaseAnonKey: process.env.B2B_PUBLIC_SUPABASE_ANON_KEY || '',
  };
  if (b2bConfig.enabled && (!b2bConfig.supabaseUrl || !b2bConfig.supabaseAnonKey)) {
    throw new Error('B2B staging requires B2B_PUBLIC_SUPABASE_URL and B2B_PUBLIC_SUPABASE_ANON_KEY');
  }
  const configPath = path.join(outDir, 'creditek/portal/b2b-runtime-config.js');
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    `window.__AURA_B2B_CONFIG__=Object.freeze(${JSON.stringify(b2bConfig)});\n`,
    'utf8',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rootDir = path.resolve(import.meta.dirname, '..');
  await buildPublic(rootDir, path.join(rootDir, 'public'));
}

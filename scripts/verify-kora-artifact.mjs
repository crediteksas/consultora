import { lstat, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_PATHS = [
  /^creditek\/agentes(?:\/|$)/,
  /^creditek\/(?:portal|convenios|legal)(?:\/|$)/,
  /(?:^|\/)migrations(?:\/|$)/,
  /(?:^|\/)tests?(?:\/|$)/,
  /(?:^|\/)scripts(?:\/|$)/,
];
const FORBIDDEN_NAMES = new Set(['package.json', 'package-lock.json', 'wrangler.jsonc', 'wrangler.toml']);
const FORBIDDEN_EXTENSIONS = new Set(['.sql', '.pem', '.toml', '.bak', '.log']);
const FORBIDDEN_CONTENT = [/\/?creditek\/agentes\//, /\.\.\/agentes\//, /KORA_AGENTS_SUPABASE_/];
const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.mjs', '.txt', '.webmanifest', '.svg']);

async function walk(root, current = root) {
  const files = [];
  for (const entry of await readdir(current)) {
    const absolute = path.join(current, entry);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error(`Symlink prohibido: ${path.relative(root, absolute)}`);
    if (info.isDirectory()) files.push(...await walk(root, absolute));
    else files.push(absolute);
  }
  return files;
}

function localReference(value) {
  const clean = value.split('#')[0].split('?')[0];
  if (!clean || /\$\{|\{\{|<%/.test(clean) || /^(?:[a-z]+:|\/\/|#)/i.test(clean)) return null;
  return clean;
}

async function verifyHtmlReferences(root, file, source) {
  const baseReference = source.match(/<base\s+[^>]*href=["']([^"']+)["']/i)?.[1];
  const base = baseReference?.startsWith('/')
    ? path.join(root, baseReference.slice(1))
    : path.dirname(file);
  for (const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const reference = localReference(match[1]);
    if (!reference) continue;
    const target = reference.startsWith('/')
      ? path.join(root, reference.slice(1))
      : path.resolve(base, reference);
    try {
      await stat(target);
    } catch {
      throw new Error(`Referencia local sin resolver: ${path.relative(root, file)} -> ${match[1]}`);
    }
  }
}

export async function verifyKoraArtifact(root) {
  const required = [
    'creditek/erp/app.html',
    'creditek/erp/sidebar.js',
    'creditek/erp/kora.webmanifest',
    'creditek/erp/kora-icon-192.png',
    'creditek/erp/kora-icon-512.png',
    'creditek/erp/kora-icon-maskable-512.png',
    'creditek/erp/kora-install.js',
    'creditek/erp/kora-service-worker.js',
    'creditek/shared/branding/creditek-logo.png',
    'config/kora-environment.js',
    'config/kora-environment.generated.js',
    'kora-build-manifest.static.json',
  ];
  for (const relative of required) await stat(path.join(root, relative));

  for (const file of await walk(root)) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    const extension = path.extname(file).toLowerCase();
    if (FORBIDDEN_PATHS.some(pattern => pattern.test(relative))) throw new Error(`Ruta prohibida en KORA: ${relative}`);
    if (FORBIDDEN_NAMES.has(path.basename(file)) || FORBIDDEN_EXTENSIONS.has(extension)) throw new Error(`Archivo privado en KORA: ${relative}`);
    if (!TEXT_EXTENSIONS.has(extension)) continue;
    const source = await readFile(file, 'utf8');
    if (FORBIDDEN_CONTENT.some(pattern => pattern.test(source))) throw new Error(`Referencia cruzada en KORA: ${relative}`);
    if (extension === '.html') await verifyHtmlReferences(root, file, source);
  }
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await verifyKoraArtifact(path.resolve(import.meta.dirname, '../dist/kora'));
  console.log('Artefacto KORA verificado');
}

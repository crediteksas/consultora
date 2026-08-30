import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILES = [
  'creditek/convenios/index.html',
  'creditek/erp/registro.html',
  'creditek/legal/index.html',
  'design-system/components/kora-product.css',
  'design-system/components/kora-product.js',
];

export async function buildRegistro(root, out = path.join(root, 'dist/registro')) {
  const resolvedOut = path.resolve(out);
  const expectedOut = path.resolve(root, 'dist/registro');
  if (resolvedOut !== expectedOut && !resolvedOut.includes(`${path.sep}creditek-registro-`)) {
    throw new Error(`Salida de registro no autorizada: ${resolvedOut}`);
  }
  await rm(resolvedOut, { recursive: true, force: true });
  await mkdir(resolvedOut, { recursive: true });
  for (const relative of FILES) {
    const target = path.join(resolvedOut, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(root, relative), target);
  }
  await writeFile(path.join(resolvedOut, 'index.html'), `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=/creditek/convenios/"><title>Registro Creditek</title></head>
<body><a href="/creditek/convenios/">Abrir registro de aliados</a></body></html>\n`);
  return resolvedOut;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(import.meta.dirname, '..');
  await buildRegistro(root);
  console.log('Artefacto aislado de registro generado en dist/registro');
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

test('las páginas KORA no generan atributos onclick ejecutables', async () => {
  const erp = fileURLToPath(new URL('../../creditek/erp/', import.meta.url));
  for (const name of (await readdir(erp)).filter(file => file.endsWith('.html'))) {
    const html = await readFile(path.join(erp, name), 'utf8');
    assert.doesNotMatch(html, /\s+onclick\s*=\s*["']/i, name);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const erp = fileURLToPath(new URL('../../creditek/erp/', import.meta.url));
const bundleName = 'supabase-js-2.110.8.js';

test('KORA sirve una versión local e inmutable de supabase-js', async () => {
  const bundle = await readFile(path.join(erp, bundleName));
  assert.equal(createHash('sha256').update(bundle).digest('hex'), '913f94db33b394a97d34c058347009053ac2d9534459c0990eb08594a108d2ee');
  let consumers = 0;
  for (const name of (await readdir(erp)).filter(file => file.endsWith('.html'))) {
    const html = await readFile(path.join(erp, name), 'utf8');
    assert.doesNotMatch(html, /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2(?:["/]|$)/, name);
    if (html.includes(`/creditek/erp/${bundleName}`)) consumers++;
  }
  assert.equal(consumers, 44);
});

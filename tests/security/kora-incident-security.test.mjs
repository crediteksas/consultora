import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => readFile(path.join(root, relative), 'utf8');

test('Incident Center no publica secretos ni usa service role en frontend', async () => {
  const files = await Promise.all([
    read('creditek/erp/kora-incident-center.js'),
    read('creditek/erp/incidencias-app.js'),
    read('creditek/erp/kora-incident-domain.js'),
  ]);
  const source = files.join('\n');

  assert.doesNotMatch(source, /service_role|SUPABASE_SERVICE_KEY|access_token\s*[:=]|document\.cookie/i);
  assert.doesNotMatch(source, /getPublicUrl/);
  assert.match(source, /createSignedUrl/);
  assert.match(source, /redactSensitive/);
});

test('la evidencia permanece privada y los paths son impredecibles', async () => {
  const source = await read('creditek/erp/kora-incident-center.js');

  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /kora-incident-evidence/);
  assert.doesNotMatch(source, /publicURL|publicUrl|upsert:\s*true/);
});

test('el build publica únicamente los activos de ejecución del Incident Center', async () => {
  const build = await read('scripts/build-public.mjs');

  assert.match(build, /ERP_EXTENSIONS/);
  assert.doesNotMatch(build, /migrations/);
});

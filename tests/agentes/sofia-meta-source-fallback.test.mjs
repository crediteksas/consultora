import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

for (const [label, path] of [
  ['deployable worker', new URL('../../creditek/workers/creditek-bot/index.js', import.meta.url)],
  ['TypeScript source', new URL('../../creditek/workers/creditek-bot/index.ts', import.meta.url)],
]) {
  test(`${label}: una referencia ausente no se inventa como WhatsApp orgánico`, async () => {
    const source = await readFile(path, 'utf8');
    const start = source.indexOf('function determinarFuente');
    const end = source.indexOf('function canalOrigenReal', start);
    const block = source.slice(start, end);
    assert.match(block, /meta_ads_sin_clasificar/);
    assert.doesNotMatch(block, /return ["']whatsapp_organico["']/);
    assert.match(source, /canalOrigenReal[\s\S]*meta_ads_sin_clasificar/);
  });
}

test('el CRM incluye Meta sin clasificar dentro de la fuente publicitaria', async () => {
  const source = await readFile(new URL('../../creditek/agentes/creditek-agente-respuestas.html', import.meta.url), 'utf8');
  assert.match(source, /fuente==='meta_ads_sin_clasificar'/);
});

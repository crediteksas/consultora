import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

for (const path of [
  new URL('../../creditek/workers/creditek-bot/index.ts', import.meta.url),
  new URL('../../creditek/workers/creditek-bot/index.js', import.meta.url),
]) {
  test(`handoff manual queda autenticado, idempotente y confirma Meta: ${path.pathname.endsWith('.ts') ? 'TS' : 'JS'}`, async () => {
    const source = await readFile(path, 'utf8');
    assert.match(source, /api\/notificar-asesor/);
    assert.match(source, /if \(!autorizado\)/);
    assert.match(source, /advisor_handoff_manual:/);
    assert.match(source, /await notificarAsesor/);
    assert.match(source, /await confirmarHandoff/);
    assert.match(source, /estado_funnel:\s*["']transferido_asesor["']/);
    assert.match(source, /cliente_notificado/);
  });
}

test('la evidencia de handoff completa la clave heredada requerida por producción', async () => {
  for (const path of [
    new URL('../../creditek/workers/creditek-bot/commercial-kpis.ts', import.meta.url),
    new URL('../../creditek/workers/creditek-bot/index.js', import.meta.url),
  ]) {
    const source = await readFile(path, 'utf8');
    assert.match(source, /response_key:\s*input\.idempotencyKey/);
  }
});

test('una notificación sin remitente no rompe el webhook', async () => {
  for (const path of [
    new URL('../../creditek/workers/creditek-bot/index.ts', import.meta.url),
    new URL('../../creditek/workers/creditek-bot/index.js', import.meta.url),
  ]) {
    const source = await readFile(path, 'utf8');
    assert.match(source, /String\(telefono \|\| ["']{2}\)\.replace/);
    assert.match(source, /if \(!limpio\) return null/);
  }
});

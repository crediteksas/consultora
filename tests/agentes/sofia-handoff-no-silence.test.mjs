import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

for (const [label, path] of [
  ['deployable worker', new URL('../../creditek/workers/creditek-bot/index.js', import.meta.url)],
  ['TypeScript source', new URL('../../creditek/workers/creditek-bot/index.ts', import.meta.url)],
]) {
  test(`${label}: una falla al notificar al asesor nunca deja al cliente en silencio`, async () => {
    const source = await readFile(path, 'utf8');
    assert.match(source, /HANDOFF_PENDING/);
    assert.match(source, /Recib(?:\\xED|í) tus datos correctamente/);
    assert.match(source, /conv\.estado = ["']HANDOFF_PENDING["']/);
    assert.match(source, /await sendFn\(pendingMsg\)/);
    assert.match(source, /respondido_por: ["']bot["']/);
  });

  test(`${label}: no declara transferencia antes de confirmar la notificación`, async () => {
    const source = await readFile(path, 'utf8');
    const handoffStart = source.indexOf('async function hacerHandoff');
    const handoffEnd = source.indexOf('async function manejarConfirmacionAsesor', handoffStart);
    const handoff = source.slice(handoffStart, handoffEnd);
    assert.ok(handoffStart >= 0 && handoffEnd > handoffStart);
    assert.ok(handoff.indexOf('procesarHandoffCertificado') < handoff.indexOf('transferido_asesor'));
    assert.ok(handoff.indexOf('HANDOFF_PENDING') < handoff.indexOf('transferido_asesor'));
  });
}

test('DATOS_MIN rehidrata nombre y cédula ya guardados antes de repreguntar', async () => {
  for (const path of [
    new URL('../../creditek/workers/creditek-bot/index.ts', import.meta.url),
    new URL('../../creditek/workers/creditek-bot/index.js', import.meta.url),
  ]) {
    const source = await readFile(path, 'utf8');
    assert.match(source, /select=nombre,cedula,telefono_contacto,tienda_id,ciudad,ciudad_normalizada/);
    assert.match(source, /conv\.cedula \|\|= existente\.cedula/);
  }
});

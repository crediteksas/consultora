import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../creditek/agentes/sofia-campanas.html', import.meta.url), 'utf8');

test('la pantalla usa la sesión AURA y nunca el secreto compartido', () => {
  assert.match(source, /import \{ auraAuth \} from '\.\/aura-auth\.mjs'/);
  assert.match(source, /Authorization:`Bearer \$\{token\}`/);
  assert.doesNotMatch(source, /X-Worker-Secret|WORKER_SHARED_SECRET/);
});

test('la primera fase no ofrece ninguna acción de envío', () => {
  assert.match(source, /No guarda, programa ni envía mensajes/);
  assert.match(source, /Guardar borrador \(próxima fase\)/);
  assert.doesNotMatch(source, /\/api\/enviar-mensaje|\/api\/campaigns\/send/);
});

test('la vista previa crea la imagen con APIs seguras del DOM', () => {
  assert.match(source, /document\.createElement\('img'\)/);
  assert.doesNotMatch(source, /media'\)\.innerHTML/);
});

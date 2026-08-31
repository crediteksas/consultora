import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const worker = await readFile(new URL('../../creditek/workers/creditek-bot/index.js', import.meta.url), 'utf8');

test('Sofía reconoce preguntas de requisitos y trámite durante la captura', () => {
  assert.match(worker, /requisitos\?\|condiciones\?/);
  assert.match(worker, /No tienes que darme la c\\xE9dula ahora para recibir informaci\\xF3n/);
});

test('Sofía transfiere al interesado sin exigir nombre o cédula', () => {
  assert.match(worker, /detectaReservaDatosConInteres\(texto\).*detectaAcepta\(texto\).*!conv\.nombre.*!conv\.cedula/s);
  assert.match(worker, /hacerHandoff\(conv, clienteId, sendFn, env2, sk, canal, true\)/);
  assert.match(worker, /HANDOFF_INFORMATIVO/);
});

test('Sofía responde la duda sin volver a pedir inmediatamente la cédula', () => {
  assert.match(worker, /Si quieres, te comunico con un asesor para que primero resuelva tus dudas/);
  assert.doesNotMatch(worker, /respuesta = siguienteDato \? `\$\{respuestaDuda\}/);
});

test('el seguimiento automático usa la etapa conversacional', () => {
  assert.match(worker, /mensajeSeguimientoPorEstado\(estadoConversacion\)/);
  assert.match(worker, /estadoGuardado = await env2\.CONVERSATIONS\.get\(c\.telefono\)/);
});

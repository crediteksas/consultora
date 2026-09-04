import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runtime = await readFile(
  new URL('../../creditek/workers/creditek-bot/index.js', import.meta.url),
  'utf8',
);
const typescript = await readFile(
  new URL('../../creditek/workers/creditek-bot/index.ts', import.meta.url),
  'utf8',
);

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function extractFunction(name) {
  const start = runtime.indexOf(`function ${name}(`);
  const end = runtime.indexOf(`\n__name(${name}`, start);
  assert.ok(start >= 0 && end > start, `debe existir ${name}`);
  return runtime.slice(start, end);
}

const tieneIntencionReal = new Function(
  'norm2',
  `${extractFunction('tieneIntencionReal')}; return tieneIntencionReal;`,
)(normalize);

const clasificarIntencionConversacional = new Function(
  'norm2',
  'detectaInteresAlianzaComercial',
  `${extractFunction('clasificarIntencionConversacional')}; return clasificarIntencionConversacional;`,
)(normalize, text => /alianza|aliado/i.test(text));

const combinarRespuestaConSiguientePaso = new Function(
  `${extractFunction('combinarRespuestaConSiguientePaso')}; return combinarRespuestaConSiguientePaso;`,
)();

const evitarRespuestaRepetida = new Function(
  'norm2',
  `${extractFunction('evitarRespuestaRepetida')}; return evitarRespuestaRepetida;`,
)(normalize);

test('1. cobertura deja de ofrecer una lista fija posiblemente desactualizada', () => {
  assert.doesNotMatch(runtime, /puede que te quede cerca una de estas/);
  assert.match(runtime, /No veo una tienda activa en esa ciudad/);
});

test('2. una pregunta de pago se reconoce como intención real', () => {
  assert.equal(tieneIntencionReal('Cómo es el pago por favor'), true);
});

test('3. una solicitud de contacto se reconoce como intención real', () => {
  assert.equal(tieneIntencionReal('Me pueden mandar un número para comunicarme'), true);
});

test('4. una cortesía corta no reabre innecesariamente el embudo', () => {
  assert.equal(tieneIntencionReal('Gracias'), false);
});

test('5. clasifica consultas de ubicación', () => {
  assert.equal(clasificarIntencionConversacional('Dónde queda la tienda'), 'ubicacion_tienda');
});

test('6. clasifica solicitudes de asesor o contacto', () => {
  assert.equal(clasificarIntencionConversacional('Quiero hablar con un asesor'), 'contacto_asesor');
});

test('7. clasifica preguntas de crédito y cuotas', () => {
  assert.equal(clasificarIntencionConversacional('Cuánto pago por cuota'), 'credito_condiciones');
});

test('8. conserva una sola pregunta al añadir el siguiente paso', () => {
  const result = combinarRespuestaConSiguientePaso(
    'Ese equipo es una buena opción. ¿Quieres que te cuente más?',
    '¿En qué ciudad estás?',
  );
  assert.equal((result.match(/\?/g) || []).length, 1);
  assert.equal(result, 'Ese equipo es una buena opción.\n\n¿En qué ciudad estás?');
});

test('9. reemplaza un cierre genérico repetido por una respuesta distinta', () => {
  const result = evitarRespuestaRepetida(
    '¡Con gusto! Si necesitas algo más aquí estoy 😊',
    ['Sofia: ¡Con gusto! Si necesitas algo más aquí estoy 😊'],
    'FIN',
  );
  assert.equal(result, 'Quedo atenta si quieres retomar el proceso.');
});

test('10. cada mensaje nuevo persiste intención, etapa y pregunta pendiente', () => {
  for (const source of [runtime, typescript]) {
    assert.match(source, /intent: data\.intent \|\| clasificarIntencionConversacional\(data\.contenido\)/);
    assert.match(source, /conversation_stage: data\.conversation_stage \|\| null/);
    assert.match(source, /pending_question: data\.pending_question \|\| null/);
    assert.match(source, /conversation_stage: conv\.estado/);
  }
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(
  new URL('../../creditek/agentes/creditek-agente-respuestas.html', import.meta.url),
  'utf8',
);

function loadPolicy() {
  const start = html.indexOf('const INTERVENTION_WINDOW_MS=');
  const end = html.indexOf('function recomputeInterventions()', start);
  assert.ok(start > 0 && end > start, 'la política de intervención debe existir');
  return new Function(`${html.slice(start, end)};return {interventionReasons};`)();
}

function message({ minutesAgo, direction, content }) {
  return {
    timestamp: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    direccion: direction,
    contenido: content,
  };
}

test('muestra una bandeja y contador dedicados a intervención', () => {
  assert.match(html, /id="b-intervention"/);
  assert.match(html, /id="s-intervention"/);
  assert.match(html, /Necesita intervención/);
  assert.match(html, /currentInbox==='intervention'/);
});

test('detecta un cliente reciente sin respuesta', () => {
  const { interventionReasons } = loadPolicy();
  const reasons = interventionReasons([
    message({ minutesAgo: 2, direction: 'entrada', content: 'Quiero conocer los requisitos' }),
  ], { estado_funnel: 'contactado' });
  assert.ok(reasons.includes('Cliente sin respuesta'));
});

test('detecta preguntas repetidas por Sofía', () => {
  const { interventionReasons } = loadPolicy();
  const reasons = interventionReasons([
    message({ minutesAgo: 10, direction: 'salida', content: '¿Y tu número de cédula?' }),
    message({ minutesAgo: 5, direction: 'salida', content: '¿Y tu número de cédula?' }),
  ], { estado_funnel: 'contactado' });
  assert.ok(reasons.includes('Sofía repitió una pregunta'));
});

test('detecta interés cerrado incorrectamente y traslado incompleto', () => {
  const { interventionReasons } = loadPolicy();
  const reasons = interventionReasons([
    message({ minutesAgo: 20, direction: 'entrada', content: 'Primero dime los requisitos' }),
    message({ minutesAgo: 15, direction: 'salida', content: 'Te conecto con un asesor' }),
    message({ minutesAgo: 5, direction: 'salida', content: 'No hay problema, no te escribiré nuevamente' }),
  ], { estado_funnel: 'perdido' });
  assert.ok(reasons.includes('Traslado prometido sin completar'));
  assert.ok(reasons.includes('Interés cerrado incorrectamente'));
});

test('el panel muestra el embudo comercial del cliente', () => {
  assert.match(html, /Embudo comercial/);
  assert.match(html, /Informándose/);
  assert.match(html, /Tienda seleccionada/);
  assert.match(html, /Listo para asesor/);
  assert.match(html, /Asesor asignado/);
});

test('el panel conserva la tienda asignada por Sofía y muestra su seguimiento', () => {
  assert.match(html, /assignedStore=.*cl\?\.tienda_id/);
  assert.match(html, /Seguimiento de tienda/);
  assert.match(html, /Tienda responsable/);
  assert.match(html, /Asesor responsable/);
  assert.match(html, /Control SLA/);
});

test('pone en intervención handoffs vencidos y contactos fallidos', () => {
  const { interventionReasons } = loadPolicy();
  const oldTransfer = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  assert.ok(interventionReasons([], { estado_funnel: 'transferido_asesor', fecha_transferido_asesor: oldTransfer }).includes('Tienda no confirmó contacto dentro del SLA'));
  assert.ok(interventionReasons([], { estado_funnel: 'transferido_asesor', confirmacion_asesor: 'no_contactado' }).includes('Tienda no pudo contactar al cliente'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../creditek/agentes/creditek-agente-respuestas.html', import.meta.url), 'utf8');

test('Sofía muestra una cola de asignaciones pendientes con tienda y asesor', () => {
  assert.match(source, /Asignaciones pendientes/);
  assert.match(source, /estado_funnel==='lead_caliente'&&c\.tienda_id/);
  assert.match(source, /t\.nombre_comercial/);
  assert.match(source, /t\.contacto/);
  assert.match(source, /openPendingChat/);
});

test('la cola no presenta cédulas ni envía datos por sí sola', () => {
  const start = source.indexOf('function renderPendingHandoffs');
  const end = source.indexOf('function openPendingChat', start);
  const queue = source.slice(start, end);
  assert.doesNotMatch(queue, /cedula|cédula/i);
  assert.doesNotMatch(queue, /cedula|cédula/i);
});

test('la recuperación exige confirmación y usa el proxy autenticado de AURA', () => {
  assert.match(source, /Notificar asesor/);
  assert.match(source, /confirm\('Se enviarán al asesor/);
  assert.match(source, /auraSofiaFetch\('\/notificar-asesor'/);
});

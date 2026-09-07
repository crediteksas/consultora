import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(
  new URL('../../creditek/agentes/creditek-agente-respuestas.html', import.meta.url),
  'utf8',
);

const rangeFunction = html.match(/function getConversationDateRange\(df,now=new Date\(\)\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(rangeFunction, 'Debe existir el cálculo aislado del rango de fechas');
const context = { Intl, Date };
vm.runInNewContext(`${rangeFunction};this.getConversationDateRange=getConversationDateRange`, context);

test('Sofía calcula el día con la zona horaria de Colombia', () => {
  assert.match(html, /timeZone:'America\/Bogota'/);
  assert.match(html, /const todayStart=new Date\(Date\.UTC\([^;]+,5\)\)/);
});

test('Ayer termina al comenzar hoy y no mezcla conversaciones de hoy', () => {
  const range = context.getConversationDateRange('yesterday', new Date('2026-09-07T04:30:00.000Z'));
  assert.equal(range.since.toISOString(), '2026-09-05T05:00:00.000Z');
  assert.equal(range.before.toISOString(), '2026-09-06T05:00:00.000Z');
  assert.match(html, /timestamp>=since&&\(!before\|\|timestamp<before\)/);
});

test('Hoy queda limitado al día calendario actual de Colombia', () => {
  const range = context.getConversationDateRange('today', new Date('2026-09-07T04:30:00.000Z'));
  assert.equal(range.since.toISOString(), '2026-09-06T05:00:00.000Z');
  assert.equal(range.before.toISOString(), '2026-09-07T05:00:00.000Z');
});

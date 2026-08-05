import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const hub = await readFile(new URL('../../creditek/agentes/index.html', import.meta.url), 'utf8');
const context = await readFile(new URL('../../creditek/agentes/kora-agent-context.js', import.meta.url), 'utf8');
const calendar = await readFile(new URL('../../creditek/agentes/creditek-agente-calendario.html', import.meta.url), 'utf8');

test('AURA muestra nombres funcionales y no enlaza Reportes de KORA', () => {
  for (const name of ['Redes Sociales', 'Sofía', 'Meta Ads Intelligence', 'Calendario de contenido']) {
    assert.match(hub, new RegExp(name, 'i'));
    assert.match(context, new RegExp(name, 'i'));
  }
  assert.doesNotMatch(context, /\.\.\/erp\/reportes\.html/);
  assert.doesNotMatch(context, /label:\s*'Reportes'/);
});

test('la primera pantalla se identifica como Panel general', () => {
  assert.match(context, /label:\s*'Panel general'/);
  assert.match(context, /home:\s*'Panel general'/);
});

test('Calendario usa scroll interno y evita un segundo shell al estar embebido', () => {
  assert.match(calendar, /window\.self===window\.top/);
  assert.doesNotMatch(calendar, /<script src="\/creditek\/erp\/sidebar\.js/);
  assert.match(calendar, /#app\s*\{[^}]*height:100dvh[^}]*min-height:0[^}]*display:flex/);
  assert.match(calendar, /\.agent4-workspace\s*\{[^}]*min-height:0/);
  assert.match(calendar, /\.ca\s*\{[^}]*overflow-y:auto/);
});

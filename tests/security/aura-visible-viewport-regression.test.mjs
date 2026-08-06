import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const hub = await readFile(new URL('../../creditek/agentes/index.html', import.meta.url), 'utf8');
const sofia = await readFile(new URL('../../creditek/agentes/creditek-agente-respuestas.html', import.meta.url), 'utf8');
const bootstrap = await readFile(new URL('../../creditek/agentes/aura-agent-bootstrap.js', import.meta.url), 'utf8');

test('Sofía se revela dentro del iframe de AURA', () => {
  assert.match(bootstrap, /global\.self\s*!==\s*global\.top/);
  assert.match(sofia, /aura-embedded/);
  assert.match(sofia, /html\.aura-embedded\s+#app\s*\{[^}]*display:flex!important/);
});

test('el Hub ocupa una sola ventana y desplaza solo su contenido', () => {
  assert.match(hub, /body\{[^}]*height:100dvh[^}]*overflow:hidden/);
  assert.match(hub, /#app\{[^}]*height:100dvh[^}]*min-height:0/);
  assert.match(hub, /\.main-area\{[^}]*height:100dvh[^}]*min-height:0[^}]*overflow:hidden/);
  assert.match(hub, /\.content\{[^}]*overflow-y:auto/);
});

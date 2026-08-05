import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const hub = await readFile(new URL('../../creditek/agentes/index.html', import.meta.url), 'utf8');
const sofia = await readFile(new URL('../../creditek/agentes/creditek-agente-respuestas.html', import.meta.url), 'utf8');

test('Sofía no monta una segunda navegación dentro de AURA', () => {
  assert.match(sofia, /window\.self===window\.top/);
  assert.doesNotMatch(sofia, /<script src="\/creditek\/erp\/sidebar\.js/);
  assert.doesNotMatch(sofia, /<script src="kora-agent-context\.js/);
  assert.match(sofia, /data-kora-shell-root/);
  assert.match(sofia, /#app\s*\{[^}]*display:flex/);
});

test('los cuatro agentes y las tres herramientas caben en una fila amplia', () => {
  assert.match(hub, /@media\(min-width:1200px\)[^{]*\{[\s\S]*?\.modules-grid\{grid-template-columns:repeat\(4,1fr\)\}/);
  assert.match(hub, /@media\(min-width:1200px\)[^{]*\{[\s\S]*?\.tools-grid\{grid-template-columns:repeat\(3,1fr\)\}/);
});

test('el Hub ocupa una sola ventana y desplaza solo su contenido', () => {
  assert.match(hub, /body\{[^}]*height:100dvh[^}]*overflow:hidden/);
  assert.match(hub, /#app\{[^}]*height:100dvh[^}]*min-height:0/);
  assert.match(hub, /\.main-area\{[^}]*height:100dvh[^}]*min-height:0[^}]*overflow:hidden/);
  assert.match(hub, /\.content\{[^}]*overflow-y:auto/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const redes = await readFile(new URL('../../creditek/agentes/creditek-agente-redes.html', import.meta.url), 'utf8');
const hub = await readFile(new URL('../../creditek/agentes/index.html', import.meta.url), 'utf8');

test('Redes Sociales no monta un segundo shell cuando abre dentro de AURA', () => {
  assert.match(redes, /window\.self===window\.top/);
  assert.doesNotMatch(redes, /<script src="\/creditek\/erp\/sidebar\.js/);
  assert.doesNotMatch(redes, /<script src="kora-agent-context\.js/);
  assert.match(redes, /data-kora-shell-root/);
});

test('Redes Sociales hace visible el contenido cuando está embebido en AURA', () => {
  assert.match(redes, /window\.self\s*!==\s*window\.top[\s\S]*classList\.add\(['"]show['"]\)/);
});

test('el Hub no inicia el shell ERP antes de restaurar la sesión AURA', () => {
  assert.doesNotMatch(hub, /<script src="\/creditek\/erp\/sidebar\.js/);
  assert.doesNotMatch(hub, /<script src="kora-agent-context\.js/);
  assert.match(hub, /import \{ auraAuth/);
});

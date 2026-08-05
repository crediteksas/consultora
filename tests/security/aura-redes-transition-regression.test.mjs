import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const redes = await readFile(new URL('../../creditek/agentes/creditek-agente-redes.html', import.meta.url), 'utf8');

test('Redes Sociales no monta un segundo shell cuando abre dentro de AURA', () => {
  assert.match(redes, /window\.self===window\.top/);
  assert.doesNotMatch(redes, /<script src="\/creditek\/erp\/sidebar\.js/);
  assert.doesNotMatch(redes, /<script src="kora-agent-context\.js/);
  assert.match(redes, /data-kora-shell-root/);
});

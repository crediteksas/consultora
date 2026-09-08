import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

test('AURA enlaza el módulo privado de Finanzas sin incrustar datos de cartera', async () => {
  const [shell, module] = await Promise.all([
    readFile(path.join(root, 'creditek/agentes/index.html'), 'utf8'),
    readFile(path.join(root, 'creditek/agentes/aura-finanzas.html'), 'utf8'),
  ]);

  assert.match(shell, /aura-finanzas\.html/);
  assert.match(shell, /Finanzas privadas/);
  assert.match(module, /aura_supa_session/);
  assert.match(module, /Authorization:`Bearer \$\{s\.access_token\}`/);
  assert.match(module, /<h1>Inversiones<\/h1>/);
  assert.match(module, /Valor \/ peso/);
  assert.match(module, /VOO/);
  assert.doesNotMatch(module, /Sofía Finanzas/);
  assert.doesNotMatch(module, /962\.55|1710\.80|0\.00381625/);
});

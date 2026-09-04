import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => readFile(path.join(root, relative), 'utf8');

test('Sofía Finanzas forma parte del control de permisos y no incrusta saldos', async () => {
  const [shell, modules, finance] = await Promise.all([
    read('creditek/agentes/index.html'), read('creditek/agentes/aura-module-config.js'), read('creditek/agentes/aura-finanzas.html'),
  ]);
  assert.match(shell, /data-aura-app="finanzas"/);
  assert.match(shell, /isAuraOwner\(\).*finanzas\.read/s);
  assert.match(modules, /permission: 'finanzas\.read'/);
  assert.match(finance, /aura_supa_session/);
  assert.match(finance, /Authorization:`Bearer \$\{s\.access_token\}`/);
  assert.doesNotMatch(finance, /962\.55|1710\.80|0\.00381625/);
});

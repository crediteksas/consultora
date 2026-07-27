import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const examples = [
  '.env.example',
  '.dev.vars.example',
  'config/kora-environment.example.js',
  'config/staging-data.example.json',
];

test('los ejemplos existen y no contienen secretos utilizables', async () => {
  for (const relative of examples) {
    const source = await readFile(path.join(root, relative), 'utf8');
    assert.doesNotMatch(source, /eyJ[A-Za-z0-9_-]{20,}/);
    assert.doesNotMatch(source, /-----BEGIN .*PRIVATE KEY-----/);
    assert.doesNotMatch(source, /\bservice_role\b/i);
    assert.doesNotMatch(source, /AIza[A-Za-z0-9_-]{20,}/);
  }
});

test('ninguna pantalla productiva consume todavía el adaptador', async () => {
  for (const relative of [
    'creditek/erp/sidebar.js',
    'creditek/erp/tablero.html',
    'creditek/erp/utilidad-creditek-app.js',
    'creditek/agentes/index.html',
  ]) {
    const source = await readFile(path.join(root, relative), 'utf8');
    assert.doesNotMatch(source, /KoraEnvironment|__KORA_ENV__/);
  }
});

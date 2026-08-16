import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

async function read(relative) {
  return readFile(path.join(root, relative), 'utf8');
}

test('cada página de agente expone un título propio de AURA', async () => {
  const pages = [
    ['creditek/agentes/agente3-meta-ads.html', 'Agente 3 · Meta Ads — AURA'],
    ['creditek/agentes/creditek-agente-calendario.html', 'Agente 4 · Calendario — AURA'],
    ['creditek/agentes/creditek-agente-redes.html', 'Agente 1 · Piezas comerciales — AURA'],
    ['creditek/agentes/creditek-agente-respuestas.html', 'Sofía · Respuestas — AURA'],
    ['creditek/agentes/creditek-gbp-fichas.html', 'Google Business Profile — AURA'],
  ];

  for (const [file, title] of pages) {
    const html = await read(file);
    assert.match(html, new RegExp(`<title>${title}</title>`), file);
  }
});

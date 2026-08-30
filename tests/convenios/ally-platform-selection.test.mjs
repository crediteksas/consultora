import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../creditek/convenios/index.html', import.meta.url), 'utf8');

test('el aliado puede solicitar varias plataformas sin opciones premarcadas', () => {
  for (const value of ['payjoy', 'alo_credit', 'addi', 'krediya']) {
    assert.match(html, new RegExp(`type="checkbox" value="${value}"`));
  }
  assert.doesNotMatch(html, /type="checkbox" value="(?:payjoy|alo_credit|addi|krediya)" checked/);
});

test('exige al menos una plataforma antes de enviar', () => {
  assert.match(html, /plataformasSolicitadas\.length/);
  assert.match(html, /Selecciona al menos una plataforma/);
});

test('envía la selección al backend para generar solo los formatos aplicables', () => {
  assert.match(html, /plataformasSolicitadas,\s*\n/);
});

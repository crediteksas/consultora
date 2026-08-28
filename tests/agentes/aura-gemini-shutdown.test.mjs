import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const calendar = await readFile(new URL('../../creditek/agentes/creditek-agente-calendario.html', import.meta.url), 'utf8');
const imageClient = await readFile(new URL('../../creditek/agentes/aura-image-client.mjs', import.meta.url), 'utf8');
const worker = await readFile(new URL('../../creditek/workers/gemini-proxy/index.js', import.meta.url), 'utf8');
const catalog = await readFile(new URL('../../catalogo_creditek.py', import.meta.url), 'utf8');

test('Calendario usa una generación Recraft y compone texto y logo localmente', () => {
  assert.match(calendar, /generarFotoRecraftAgente4/);
  assert.match(calendar, /llamarImagenWorkerAgente4\('\/recraft\/images'/);
  assert.match(calendar, /canvas\.toDataURL\('image\/png'\)\.split\(','\)\[1\]/);
  assert.match(calendar, /1 imagen Recraft \(35 unidades, estimado USD 0,035\)/);
  assert.match(calendar, /No habrá Gemini, GPT ni reintentos automáticos/);
  assert.doesNotMatch(calendar, /llamarImagenWorkerAgente4\('\/generate'/);
  assert.doesNotMatch(calendar, /llamarImagenWorkerAgente4\('\/openai\/responses'/);
});

test('Cliente AURA permite Recraft y GPT pero bloquea la ruta Gemini heredada', () => {
  assert.match(imageClient, /new Set\(\['\/recraft\/images', '\/openai\/responses'\]\)/);
  assert.doesNotMatch(imageClient, /new Set\([^\n]*'\/generate'/);
});

test('Worker corta el acceso público a generate antes de cualquier proveedor Google', () => {
  const allowlist = worker.match(/if \(path !== "\/openai\/responses"[^\n]+/i)?.[0] || '';
  assert.ok(allowlist);
  assert.doesNotMatch(allowlist, /"\/generate"/);
});

test('Catálogo se detiene antes de importar dependencias o consultar servicios', () => {
  const stop = catalog.indexOf("if __name__ == '__main__':");
  const imports = catalog.indexOf('import requests');
  assert.ok(stop >= 0 && imports > stop);
  assert.match(catalog.slice(stop, imports), /raise SystemExit\(0\)/);
});

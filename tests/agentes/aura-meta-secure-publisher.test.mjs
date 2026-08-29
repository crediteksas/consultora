import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../../creditek/agentes/agente3-meta-ads.html', import.meta.url), 'utf8');

test('Nueva campaña usa el catálogo seguro y no exige token local', () => {
  const openWizard = page.match(/async function abrirWizard\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(openWizard, /metaWorkerRequest\('\/v1\/publisher\/options'\)/);
  assert.doesNotMatch(openWizard, /ck_meta_token/);
  assert.doesNotMatch(openWizard, /abrirConfig\(\)/);
});

test('El botón publica únicamente mediante el Worker autenticado de AURA', () => {
  assert.match(page, /onclick="publicarCampanaSegura\(\)"/);
  assert.match(page, /async function publicarCampanaSegura\(\)/);
  assert.match(page, /metaWorkerRequest\('\/v1\/publisher\/publish'/);
  assert.match(page, /'Idempotency-Key': idempotencyKey/);
  assert.match(page, /final_confirmation: true/);
});

test('La publicación segura no recibe ni lee credenciales Meta en el navegador', () => {
  const securePublish = page.match(/async function publicarCampanaSegura\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(securePublish, /ck_meta_token/);
  assert.doesNotMatch(securePublish, /graph\.facebook\.com/);
  assert.match(securePublish, /image_data: \{ mime_type: wizImageMime, bytes_base64: wizImageBase64 \}/);
});

test('La búsqueda de ciudades usa el catálogo seguro ya autorizado', () => {
  const searchCity = page.match(/async function wizSearchCity\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(searchCity, /securePublisherCities\.filter/);
  assert.doesNotMatch(searchCity, /access_token/);
  assert.doesNotMatch(searchCity, /graph\.facebook\.com/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const responses = await readFile(path.join(root, 'creditek/agentes/creditek-agente-respuestas.html'), 'utf8');
const metaAds = await readFile(path.join(root, 'creditek/agentes/agente3-meta-ads.html'), 'utf8');

test('el frontend usa exclusivamente el proxy autenticado de AURA', () => {
  assert.match(responses, /const API='\/api\/sofia'/);
  assert.match(responses, /auraSofiaFetch\('\/tiendas'\)/);
  assert.match(responses, /auraSofiaFetch\('\/stats'\)/);
  assert.match(responses, /auraSofiaFetch\('\/enviar-mensaje'/);
  assert.match(metaAds, /const SOFIA_PROXY_API = '\/api\/sofia'/);
  assert.match(metaAds, /SOFIA_PROXY_API\}\/ventas-por-anuncio/);
});

test('ningún asset público contiene el secreto ni el header server-to-server', () => {
  for (const source of [responses, metaAds]) {
    assert.doesNotMatch(source, /WORKER_SHARED_SECRET/);
    assert.doesNotMatch(source, /X-Worker-Secret/i);
    assert.doesNotMatch(source, /creditek-bot\.comercial-853\.workers\.dev/);
  }
});

test('401, 403 y payload no-array producen fallback sin ejecutar forEach', () => {
  assert.match(responses, /if\(!response\.ok\)throw new Error\('Servicio temporalmente no disponible'\)/);
  assert.match(responses, /if\(!Array\.isArray\(payload\)\)throw new Error\('Servicio temporalmente no disponible'\)/);
  assert.match(responses, /allTiendas=payload;/);
  assert.match(responses, /Servicio temporalmente no disponible/);
});

test('los filtros de Sofía usan dos columnas legibles en anchos productivos', () => {
  assert.match(responses, /\.sidebar-filters\{[^}]*display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(responses, /\.search-box\{grid-column:1\/-1;/);
  assert.match(responses, /\.filter-sel\{width:100%;padding:6px 24px 6px 8px;/);
});

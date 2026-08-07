import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countPendingPublications,
  fetchPendingPublications,
} from '../../creditek/agentes/aura-dashboard-kpis.mjs';

test('cuenta solo piezas listas con imagen aprobada', () => {
  assert.equal(countPendingPublications([
    { id: '1', estado: 'lista_para_publicar', imagen_url: 'https://cdn.test/1.jpg' },
    { id: '2', estado: 'borrador', imagen_url: 'https://cdn.test/2.jpg' },
    { id: '3', estado: 'lista_para_publicar', imagen_url: '' },
    { id: '4', estado: 'lista_para_publicar', imagen_url: 'https://cdn.test/4.jpg' },
  ]), 2);
});

test('consulta únicamente el catálogo seguro con la sesión AURA', async () => {
  let request;
  const count = await fetchPendingPublications({
    token: 'session-token',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({
        pieces: [
          { id: '1', estado: 'lista_para_publicar', imagen_url: 'https://cdn.test/1.jpg' },
          { id: '2', estado: 'lista_para_publicar', imagen_url: 'https://cdn.test/2.jpg' },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  assert.equal(count, 2);
  assert.equal(request.url, 'https://aura-meta-ads-api.comercial-853.workers.dev/v1/publisher/options');
  assert.deepEqual(request.options, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      authorization: 'Bearer session-token',
    },
  });
  assert.equal('body' in request.options, false);
});

test('falla cerrado sin sesión y no realiza la consulta', async () => {
  let called = false;
  await assert.rejects(
    fetchPendingPublications({
      token: '',
      fetchImpl: async () => {
        called = true;
        return new Response();
      },
    }),
    /AURA_SESSION_REQUIRED/,
  );
  assert.equal(called, false);
});

test('no convierte respuestas fallidas en cifras falsas', async () => {
  await assert.rejects(
    fetchPendingPublications({
      token: 'session-token',
      fetchImpl: async () => new Response('{"error":"Forbidden"}', { status: 403 }),
    }),
    /PUBLISHER_CATALOG_UNAVAILABLE/,
  );
});

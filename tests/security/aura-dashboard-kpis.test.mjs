import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchCommercialKpis,
} from '../../creditek/agentes/aura-dashboard-kpis.mjs';

test('consulta exclusivamente el agregador comercial certificado con la sesión AURA', async () => {
  let request;
  const kpis = await fetchCommercialKpis({
    token: 'session-token',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({
        clientes_inscritos: { hoy: 0, mes: 1 },
        leads_enviados: {
          hoy: { total: 0, tiendas: 0, aliados: 0 },
          mes: { total: 0, tiendas: 0, aliados: 0 },
          certified_from: '2026-08-07T05:00:00.000Z',
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  assert.deepEqual(kpis, {
    clientesInscritos: { hoy: 0, mes: 1 },
    leadsEnviados: {
      hoy: 0, mes: 0, tiendas: 0, aliados: 0,
    },
  });
  assert.equal(request.url, 'https://aura-commercial-kpis-api.comercial-853.workers.dev/api/commercial-kpis');
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
    fetchCommercialKpis({
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

test('acepta cero como dato real y rechaza contratos incompletos', async () => {
  const zeroes = await fetchCommercialKpis({
    token: 'session-token',
    fetchImpl: async () => new Response(JSON.stringify({
      clientes_inscritos: { hoy: 0, mes: 0 },
      leads_enviados: {
        hoy: { total: 0, tiendas: 0, aliados: 0 },
        mes: { total: 0, tiendas: 0, aliados: 0 },
      },
    }), { status: 200 }),
  });
  assert.equal(zeroes.clientesInscritos.hoy, 0);
  assert.equal(zeroes.leadsEnviados.mes, 0);

  await assert.rejects(
    fetchCommercialKpis({
      token: 'session-token',
      fetchImpl: async () => new Response(JSON.stringify({
        clientes_inscritos: { hoy: 0, mes: 1 },
        leads_enviados: { hoy: { total: 0 }, mes: { total: 0 } },
      }), { status: 200 }),
    }),
    /COMMERCIAL_KPIS_UNAVAILABLE/,
  );
});

test('no convierte respuestas fallidas en cifras falsas', async () => {
  await assert.rejects(
    fetchCommercialKpis({
      token: 'session-token',
      fetchImpl: async () => new Response('{"error":"Unavailable"}', { status: 503 }),
    }),
    /COMMERCIAL_KPIS_UNAVAILABLE/,
  );
});

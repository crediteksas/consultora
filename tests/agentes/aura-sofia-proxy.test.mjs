import assert from 'node:assert/strict';
import test from 'node:test';

import { handleAuraSofiaProxy } from '../../src/aura-sofia-proxy.mjs';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const JWT = 'owner-session-token';

function ownerRequest(path = '/api/sofia/tiendas', init = {}) {
  return new Request(`https://aura.crediteksas.com${path}`, {
    ...init,
    headers: { authorization: `Bearer ${JWT}`, ...(init.headers || {}) },
  });
}

function authenticatedFetcher(upstreamResponse = Response.json([{ id: 'store-1' }])) {
  const requests = [];
  const fetcher = async (input, init = {}) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.url.includes('/auth/v1/user')) {
      return Response.json({ id: USER_ID, email: 'owner@creditek.test' });
    }
    if (request.url.includes('/rest/v1/rpc/aura_my_access')) {
      return Response.json({
        user_id: USER_ID,
        email: 'owner@creditek.test',
        active: true,
        apps: [{ app_id: 'sofia', role_id: 'aura.owner', permissions: [] }],
      });
    }
    return upstreamResponse;
  };
  return { fetcher, requests };
}

test('AURA agrega el secreto únicamente en la llamada server-to-server', async () => {
  const { fetcher, requests } = authenticatedFetcher();
  const response = await handleAuraSofiaProxy(
    ownerRequest(),
    { WORKER_SHARED_SECRET: 'rotated-server-secret', SOFIA_WORKER_URL: 'https://sofia.test' },
    fetcher,
  );

  assert.equal(response.status, 200);
  const upstream = requests.find(request => request.url === 'https://sofia.test/api/tiendas');
  assert.ok(upstream);
  assert.equal(upstream.headers.get('x-worker-secret'), 'rotated-server-secret');
  assert.notEqual(upstream.headers.get('x-worker-secret'), JWT);
});

test('bloquea navegador sin sesión AURA antes de contactar Sofía', async () => {
  let contacted = false;
  const response = await handleAuraSofiaProxy(
    new Request('https://aura.crediteksas.com/api/sofia/tiendas'),
    { WORKER_SHARED_SECRET: 'server-only', SOFIA_WORKER_URL: 'https://sofia.test' },
    async () => { contacted = true; return Response.json([]); },
  );
  assert.equal(response.status, 403);
  assert.equal(contacted, false);
});

test('sanea errores de autenticación y fallos 5xx del upstream', async () => {
  for (const status of [401, 403, 500]) {
    const { fetcher } = authenticatedFetcher(Response.json({ error: 'detalle interno' }, { status }));
    const response = await handleAuraSofiaProxy(
      ownerRequest(),
      { WORKER_SHARED_SECRET: 'server-only', SOFIA_WORKER_URL: 'https://sofia.test' },
      fetcher,
    );
    const body = await response.json();
    assert.equal(body.error, 'Servicio temporalmente no disponible');
    assert.equal(JSON.stringify(body).includes('detalle interno'), false);
  }
});

test('solo permite las rutas y métodos de Sofía aprobados', async () => {
  const { fetcher } = authenticatedFetcher();
  const unknown = await handleAuraSofiaProxy(
    ownerRequest('/api/sofia/otra'),
    { WORKER_SHARED_SECRET: 'server-only' },
    fetcher,
  );
  assert.equal(unknown.status, 404);

  const wrongMethod = await handleAuraSofiaProxy(
    ownerRequest('/api/sofia/tiendas', { method: 'POST' }),
    { WORKER_SHARED_SECRET: 'server-only' },
    fetcher,
  );
  assert.equal(wrongMethod.status, 405);
});

test('reenvía mensajes válidos sin exponer el secreto en la respuesta', async () => {
  const { fetcher, requests } = authenticatedFetcher(Response.json({ ok: true }));
  const response = await handleAuraSofiaProxy(
    ownerRequest('/api/sofia/enviar-mensaje', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ telefono: 'fixture', mensaje: 'fixture' }),
    }),
    { WORKER_SHARED_SECRET: 'server-only', SOFIA_WORKER_URL: 'https://sofia.test' },
    fetcher,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(requests.at(-1).headers.get('x-worker-secret'), 'server-only');
});

test('permite la recuperación manual de handoff únicamente por el proxy autenticado', async () => {
  const { fetcher, requests } = authenticatedFetcher(Response.json({ ok: true, cliente_notificado: true }));
  const response = await handleAuraSofiaProxy(
    ownerRequest('/api/sofia/notificar-asesor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ telefono: 'fixture' }),
    }),
    { WORKER_SHARED_SECRET: 'server-only', SOFIA_WORKER_URL: 'https://sofia.test' },
    fetcher,
  );
  assert.equal(response.status, 200);
  assert.equal(requests.at(-1).url, 'https://sofia.test/api/notificar-asesor');
  assert.equal(requests.at(-1).headers.get('x-worker-secret'), 'server-only');
});

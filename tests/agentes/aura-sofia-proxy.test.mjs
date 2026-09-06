import assert from 'node:assert/strict';
import test from 'node:test';

import { handleAuraSofiaProxy } from '../../src/aura-sofia-proxy.mjs';
import { readFile } from 'node:fs/promises';

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
    if (request.url.includes('/auth/v1/user')) return Response.json({ id: USER_ID, email: 'owner@creditek.test' });
    if (request.url.includes('/rest/v1/rpc/aura_my_access')) {
      return Response.json({ user_id: USER_ID, email: 'owner@creditek.test', active: true, apps: [{ role_id: 'aura.owner' }] });
    }
    return upstreamResponse;
  };
  return { fetcher, requests };
}

test('AURA reenvía la sesión validada cuando el secreto compartido no está configurado', async () => {
  const { fetcher, requests } = authenticatedFetcher();
  const response = await handleAuraSofiaProxy(ownerRequest(), {}, fetcher);
  assert.equal(response.status, 200);
  const upstream = requests.find(request => request.url.endsWith('/api/tiendas'));
  assert.equal(upstream.headers.get('authorization'), `Bearer ${JWT}`);
  assert.equal(upstream.headers.has('x-worker-secret'), false);
});

test('AURA conserva el canal server-to-server cuando existe secreto compartido', async () => {
  const { fetcher, requests } = authenticatedFetcher();
  const response = await handleAuraSofiaProxy(ownerRequest(), { WORKER_SHARED_SECRET: 'server-only' }, fetcher);
  assert.equal(response.status, 200);
  const upstream = requests.find(request => request.url.endsWith('/api/tiendas'));
  assert.equal(upstream.headers.get('x-worker-secret'), 'server-only');
  assert.equal(upstream.headers.has('authorization'), false);
});

test('el proxy bloquea sesiones inválidas y rutas no aprobadas', async () => {
  let contacted = false;
  const response = await handleAuraSofiaProxy(new Request('https://aura.crediteksas.com/api/sofia/stats'), {}, async () => {
    contacted = true;
    return Response.json({});
  });
  assert.equal(response.status, 403);
  assert.equal(contacted, false);

  const { fetcher } = authenticatedFetcher();
  const unknown = await handleAuraSofiaProxy(ownerRequest('/api/sofia/unknown'), {}, fetcher);
  assert.equal(unknown.status, 404);
});

test('los errores upstream se saneán sin filtrar detalles internos', async () => {
  const { fetcher } = authenticatedFetcher(Response.json({ error: 'detalle interno' }, { status: 401 }));
  const response = await handleAuraSofiaProxy(ownerRequest('/api/sofia/stats'), {}, fetcher);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { ok: false, error: 'Servicio temporalmente no disponible' });
});

test('el Worker público enruta únicamente el prefijo seguro de Sofía', async () => {
  const worker = await readFile(new URL('../../src/aura-assets-worker.mjs', import.meta.url), 'utf8');
  assert.match(worker, /pathname\.startsWith\('\/api\/sofia\/'\)/);
  assert.match(worker, /handleAuraSofiaProxy\(request, env\)/);
});

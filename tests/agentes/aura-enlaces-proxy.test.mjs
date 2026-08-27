import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authenticateAuraOwner,
  handleAuraEnlacesProxy,
} from '../../src/aura-enlaces-proxy.mjs';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const JWT = 'aura-jwt';

function auraResponses({ roleId = 'aura.owner', email = 'owner@creditek.test', appId = 'registro_links', permissions = ['registro_links.manage'] } = {}) {
  return async (input, init = {}) => {
    const request = new Request(input, init);
    if (request.url.includes('/auth/v1/user')) {
      return Response.json({ id: USER_ID, email: 'owner@creditek.test' });
    }
    if (request.url.includes('/rest/v1/rpc/aura_my_access')) {
      return Response.json({
        user_id: USER_ID,
        email,
        active: true,
        apps: [{ app_id: appId, role_id: roleId, permissions }],
      });
    }
    throw new Error(`Unexpected request: ${request.url}`);
  };
}

function auraRequest(path = '/api/aura/enlaces/origenes', init = {}) {
  return new Request(`https://registro.crediteksas.com${path}`, {
    ...init,
    headers: { authorization: `Bearer ${JWT}`, ...(init.headers || {}) },
  });
}

test('accepts only a valid AURA session with registro_links.manage', async () => {
  assert.ok(await authenticateAuraOwner(auraRequest(), auraResponses()));
  assert.ok(await authenticateAuraOwner(auraRequest(), auraResponses({ appId: 'sofia', permissions: [] })));
  assert.ok(await authenticateAuraOwner(auraRequest(), auraResponses({ roleId: 'aura.andrea_limited' })));
  assert.equal(await authenticateAuraOwner(auraRequest(), auraResponses({ roleId: 'sofia.agent', permissions: [] })), null);
  assert.equal(await authenticateAuraOwner(auraRequest(), auraResponses({ roleId: 'sofia.agent', appId: 'sofia' })), null);
  assert.equal(await authenticateAuraOwner(auraRequest(), auraResponses({ email: 'other@creditek.test' })), null);
});

test('forwards the owner request with the server-only admin token', async () => {
  const requests = [];
  const fetcher = async (input, init = {}) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.url.includes('ditiwpndvmyuqcagupea.supabase.co')) {
      return auraResponses()(request);
    }
    return Response.json([{ codigo: 'CK-01' }]);
  };

  const response = await handleAuraEnlacesProxy(
    auraRequest(),
    { ADMIN_ENLACES_TOKEN: 'server-admin-token', CLIENTES_WORKER_URL: 'https://clientes.test' },
    fetcher,
  );

  assert.equal(response.status, 200);
  const upstream = requests.find((request) => request.url === 'https://clientes.test/api/admin/origenes-enlaces');
  assert.ok(upstream);
  assert.equal(upstream.headers.get('authorization'), 'Bearer server-admin-token');
  assert.notEqual(upstream.headers.get('authorization'), `Bearer ${JWT}`);
});

test('blocks a logged-in user without the registration-links permission before contacting creditek-clientes', async () => {
  const requests = [];
  const base = auraResponses({ roleId: 'sofia.agent', permissions: [] });
  const response = await handleAuraEnlacesProxy(
    auraRequest('/api/aura/enlaces', { method: 'POST', body: JSON.stringify({ origen_codigo: 'CK-01' }) }),
    { ADMIN_ENLACES_TOKEN: 'server-admin-token', CLIENTES_WORKER_URL: 'https://clientes.test' },
    async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      return base(request);
    },
  );

  assert.equal(response.status, 403);
  assert.equal(requests.some((request) => request.url.startsWith('https://clientes.test')), false);
});

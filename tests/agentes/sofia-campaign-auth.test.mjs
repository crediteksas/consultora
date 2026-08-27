import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeSofiaCampaign } from '../../creditek/workers/creditek-bot/campaign-auth.mjs';

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'publishable' };
const request = (token = '') => new Request('https://worker.test/api/campaigns/preflight', {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});

function authFetch({ user = { id: 'user-1' }, access, status = 200 }) {
  return async (url) => new Response(JSON.stringify(url.endsWith('/auth/v1/user') ? user : access), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('rechaza solicitudes sin sesión AURA', async () => {
  const result = await authorizeSofiaCampaign(request(), env, 'sofia.campaign.read', async () => {
    throw new Error('no debe consultar la red');
  });
  assert.deepEqual(result, { ok: false, status: 401, code: 'unauthorized' });
});

test('permite al owner de AURA consultar el preflight', async () => {
  const result = await authorizeSofiaCampaign(request('valid-token'), env, 'sofia.campaign.read', authFetch({
    access: { user_id: 'user-1', active: true, apps: [{ app_id: 'sofia', role_id: 'aura.owner', permissions: ['sofia.use'] }] },
  }));
  assert.equal(result.ok, true);
  assert.equal(result.roleId, 'aura.owner');
});

test('permite únicamente el permiso específico de campañas', async () => {
  const allowed = await authorizeSofiaCampaign(request('valid-token'), env, 'sofia.campaign.read', authFetch({
    access: { user_id: 'user-1', active: true, apps: [{ app_id: 'sofia', role_id: 'sofia.marketing', permissions: ['sofia.campaign.read'] }] },
  }));
  const denied = await authorizeSofiaCampaign(request('valid-token'), env, 'sofia.campaign.send', authFetch({
    access: { user_id: 'user-1', active: true, apps: [{ app_id: 'sofia', role_id: 'sofia.marketing', permissions: ['sofia.campaign.read'] }] },
  }));
  assert.equal(allowed.ok, true);
  assert.deepEqual(denied, { ok: false, status: 403, code: 'forbidden' });
});

test('rechaza una sesión cuyo usuario no coincide con AURA', async () => {
  const result = await authorizeSofiaCampaign(request('valid-token'), env, 'sofia.campaign.read', authFetch({
    access: { user_id: 'another-user', active: true, apps: [{ app_id: 'sofia', role_id: 'aura.owner', permissions: [] }] },
  }));
  assert.deepEqual(result, { ok: false, status: 401, code: 'unauthorized' });
});

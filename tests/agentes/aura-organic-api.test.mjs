import test from 'node:test';
import assert from 'node:assert/strict';
import { organicApi } from '../../creditek/workers/aura-meta-ads-api/organic-api.mjs';
const reply = (body, status = 200) => Response.json(body, { status });
const deps = role => ({ reply, allowed: async () => ({ ok: true }), authenticate: async () => role ? { access: { user_id: 'owner', apps: [{ role_id: role }] } } : null });
test('organic HTTP rejects anonymous and ad-only permissions before touching storage', async () => {
  const req = new Request('https://aura.test/v1/organic/approve', { method: 'POST', body: '{}' });
  assert.equal((await organicApi(req, {}, deps(null))).status, 401);
  assert.equal((await organicApi(req, {}, deps('meta_ads.manager'))).status, 403);
});
test('organic HTTP reports missing infrastructure rather than claiming success', async () => {
  const result = await organicApi(new Request('https://aura.test/v1/organic/calendars'), {}, deps('aura.owner'));
  assert.equal(result.status, 503); assert.equal((await result.json()).error, 'ORGANIC_BINDINGS_NOT_CONFIGURED');
});
test('JPEG upload freezes validated bytes by SHA-256 and repeated upload never overwrites', async () => {
  let puts = 0; const objects = new Map();
  const env = { ORGANIC_CALENDARS: { getByName() { return {}; } }, META_PAGE_ID: '123', ORGANIC_PUBLIC_BASE: 'https://aura.test', ORGANIC_MEDIA: { head: async key => objects.get(key), put: async (key, bytes) => { puts++; objects.set(key, bytes); } } };
  const jpeg = new Uint8Array([255, 216, 255, 192, 0, 11, 8, 4, 56, 4, 56, 1, 1, 17, 0, 255, 217]);
  const make = () => new Request('https://aura.test/v1/organic/media', { method: 'POST', body: jpeg });
  const first = await organicApi(make(), env, deps('aura.owner')); assert.equal(first.status, 201); const body = await first.json(); assert.match(body.asset, /^[a-f0-9]{64}\.jpg$/);
  await organicApi(make(), env, deps('aura.owner')); assert.equal(puts, 1);
});
test('unknown organic write route cannot forward to Meta', async () => {
  const env = { ORGANIC_CALENDARS: { getByName() { return {}; } }, ORGANIC_MEDIA: {}, META_PAGE_ID: '123' };
  const response = await organicApi(new Request('https://aura.test/v1/organic/ads', { method: 'POST' }), env, deps('aura.owner')); assert.equal(response.status, 404);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions, Response } from 'miniflare';
import { fileURLToPath } from 'node:url';
const entry = fileURLToPath(new URL('../fixtures/aura-organic-worker.mjs', import.meta.url));
const compiled = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'browser', external: ['cloudflare:workers'] });
const asset = 'a'.repeat(64) + '.jpg';
const base = 'https://graph.facebook.com';
async function setup(t, { failInstagram = false, loseFacebookAck = false, enabled = true, unverified = false, metricsAvailable = false, missingPermissions = false } = {}) {
  let fbPosts = 0, igContainers = 0, igPublishes = 0;
  const outboundService = async request => {
    const url = new URL(request.url), path = url.pathname;
    if (url.origin !== base) throw Error('UNEXPECTED_NETWORK_BLOCKED');
    if (path === '/v25.0/123' && request.method === 'GET') return Response.json({ id: '123', name: 'Creditek test', access_token: 'fake-page-token', instagram_business_account: { id: '456', username: 'test' } });
    if (path === '/v25.0/me/permissions') return Response.json({ data: (missingPermissions ? [] : ['pages_manage_posts', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish', 'read_insights', 'instagram_manage_insights']).map(permission => ({ permission, status: 'granted' })) });
    if (path === '/v25.0/123/photos' && request.method === 'POST') { fbPosts++; return loseFacebookAck ? new Response('upstream disconnected', { status: 503 }) : Response.json({ id: '111', post_id: '123_111' }); }
    if (path === '/v25.0/456/media' && request.method === 'POST') { igContainers++; return Response.json(failInstagram ? { error: { code: 10 } } : { id: '789' }, { status: failInstagram ? 400 : 200 }); }
    if (path === '/v25.0/789') return Response.json({ id: '789', status_code: 'FINISHED' });
    if (path === '/v25.0/456/media_publish' && request.method === 'POST') { igPublishes++; return Response.json({ id: '999' }); }
    if (path === '/v25.0/123_111' && url.searchParams.get('fields')?.includes('reactions')) return Response.json(metricsAvailable ? { reactions: { summary: { total_count: 4 } }, comments: { summary: { total_count: 0 } }, shares: { count: 1 } } : {});
    if (path === '/v25.0/999' && url.searchParams.get('fields')?.includes('like_count')) return Response.json(metricsAvailable ? { like_count: 3, comments_count: 1 } : {});
    if (path.endsWith('/insights')) return metricsAvailable ? Response.json({ data: [{ name: url.searchParams.get('metric'), values: [{ value: 100 }] }] }) : Response.json({ error: { code: 100 } }, { status: 400 });
    if (path === '/v25.0/123_111') return Response.json({ id: '123_111', is_published: !unverified, permalink_url: 'https://www.facebook.com/123/posts/111' });
    if (path === '/v25.0/999') return Response.json({ id: '999', media_type: 'IMAGE', permalink: unverified ? null : 'https://www.instagram.com/p/test/' });
    throw Error('UNEXPECTED_NETWORK_BLOCKED');
  };
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: compiled.outputFiles[0].text, compatibilityDate: '2026-08-02', durableObjects: { ORGANIC_CALENDARS: { className: 'TestCalendar', useSQLite: true } }, r2Buckets: ['ORGANIC_MEDIA'], outboundService, bindings: { META_ACCESS_TOKEN: 'fake-token', META_PAGE_ID: '123', META_GRAPH_VERSION: 'v25.0', ORGANIC_AUTOMATION_ENABLED: String(enabled), ORGANIC_PUBLIC_BASE: 'https://organic.test' } }));
  t.after(() => mf.dispose());
  const bucket = await mf.getR2Bucket('ORGANIC_MEDIA'); await bucket.put(asset, 'test JPEG already validated by upload route');
  const stub = new Proxy({}, { get: (_, method) => async (...args) => {
    const response = await mf.dispatchFetch('https://tests.local/', { method: 'POST', body: JSON.stringify({ method, args }) });
    const result = await response.json(); if (!response.ok) throw Error(result.error); return result;
  } });
  const due = Date.now() + 2 * 86400000;
  const input = { id: 'calendar_test', title: 'Prueba sin publicaciones reales', revision: 0, pieces: [{ id: 'piece_test', format: 'image', caption: 'Cuida tu celular. ¿Qué consejo compartirías?', topic: 'Consejos', asset, channels: ['facebook', 'instagram'], scheduled_at: new Date(due).toISOString() }] };
  return { stub, input, due, counts: () => ({ fbPosts, igContainers, igPublishes }) };
}
async function approve(s) { const saved = await s.stub.save(s.input, 'owner'); return s.stub.approve({ id: saved.id, revision: saved.revision, digest: saved.approval_digest, confirm: 'APPROVE_CALENDAR_AND_SCHEDULE' }, 'owner'); }
test('real Workers runtime: approve calendar -> scheduled FB+IG -> verification -> no duplicate on repeated alarms', async t => {
  const s = await setup(t); await approve(s);
  assert.deepEqual(s.counts(), { fbPosts: 0, igContainers: 0, igPublishes: 0 });
  await s.stub.tick(s.due + 1000); await s.stub.tick(s.due + 62000); await s.stub.tick(s.due + 125000);
  const c = await s.stub.preview(s.input.id);
  assert.equal(c.pieces[0].results.facebook.status, 'published'); assert.equal(c.pieces[0].results.instagram.status, 'published');
  assert.deepEqual(s.counts(), { fbPosts: 1, igContainers: 1, igPublishes: 1 });
});
test('runtime: failed Instagram cannot republish successful Facebook', async t => {
  const s = await setup(t, { failInstagram: true }); await approve(s); await s.stub.tick(s.due + 1000); await s.stub.tick(s.due + 180000);
  const r = (await s.stub.preview(s.input.id)).pieces[0].results;
  assert.equal(r.facebook.status, 'published'); assert.equal(r.instagram.status, 'failed'); assert.equal(s.counts().fbPosts, 1);
});
test('runtime: ambiguous write is held for manual reconciliation, never retried', async t => {
  const s = await setup(t, { loseFacebookAck: true }); await approve(s); await s.stub.tick(s.due + 1000); await s.stub.tick(s.due + 180000);
  assert.equal((await s.stub.preview(s.input.id)).pieces[0].results.facebook.status, 'uncertain'); assert.equal(s.counts().fbPosts, 1);
});
test('runtime: edit invalidates approval; stale version cannot approve; pause prevents all sends', async t => {
  const s = await setup(t); await approve(s);
  const old = await s.stub.preview(s.input.id);
  const edited = await s.stub.save({ ...old, pieces: old.pieces.map(p => ({ ...p, caption: 'Nuevo texto para revisar.' })) }, 'owner');
  assert.equal(edited.approval, null); await s.stub.tick(s.due + 1000); assert.equal(s.counts().fbPosts, 0);
  await assert.rejects(s.stub.approve({ id: old.id, revision: old.revision, digest: old.approval_digest, confirm: 'APPROVE_CALENDAR_AND_SCHEDULE' }, 'owner'));
  await s.stub.approve({ id: edited.id, revision: edited.revision, digest: edited.approval_digest, confirm: 'APPROVE_CALENDAR_AND_SCHEDULE' }, 'owner');
  await s.stub.pause(edited.id, 'owner'); await s.stub.tick(s.due + 1000); assert.equal(s.counts().fbPosts, 0);
});
test('runtime: no catch-up publishing outside approved time tolerance and deployment kill switch', async t => {
  const s = await setup(t); await approve(s); await s.stub.tick(s.due + 2 * 3600000); assert.equal(s.counts().fbPosts, 0);
  assert.equal((await s.stub.preview(s.input.id)).pieces[0].results.facebook.error, 'MISSED_SLOT_REVIEW_REQUIRED');
  const disabled = await setup(t, { enabled: false }); await assert.rejects(approve(disabled));
});
test('runtime: acceptance is not verified publication, and missing organic permissions block approval', async t => {
  const s = await setup(t, { unverified: true }); await approve(s); await s.stub.tick(s.due + 1000); await s.stub.tick(s.due + 62000);
  const p = (await s.stub.preview(s.input.id)).pieces[0]; assert.equal(p.results.facebook.status, 'accepted'); assert.equal(p.results.instagram.status, 'accepted');
  const denied = await setup(t, { missingPermissions: true }); await assert.rejects(approve(denied), /PERMISSIONS/); assert.equal(denied.counts().fbPosts, 0);
});
test('runtime: metrics read actual counters, keep unavailable values null and never publish', async t => {
  for (const available of [true, false]) {
    const s = await setup(t, { metricsAvailable: available }); await approve(s); await s.stub.tick(s.due + 1000); await s.stub.tick(s.due + 62000);
    const p = (await s.stub.preview(s.input.id)).pieces[0]; const counts = s.counts();
    await s.stub.tick(Math.max(p.results.facebook.next_metrics, p.results.instagram.next_metrics) + 1000);
    const results = (await s.stub.preview(s.input.id)).pieces[0].results;
    assert.deepEqual(s.counts(), counts);
    assert.equal(results.facebook.snapshots[0].likes, available ? 4 : null);
    assert.equal(results.facebook.snapshots[0].comments, available ? 0 : null);
    assert.equal(results.instagram.snapshots[0].reach, available ? 100 : null);
  }
});
test('runtime: simultaneous approval is applied once; started calendars are immutable', async t => {
  const s = await setup(t); const saved = await s.stub.save(s.input, 'owner');
  const payload = { id: saved.id, revision: saved.revision, digest: saved.approval_digest, confirm: 'APPROVE_CALENDAR_AND_SCHEDULE' };
  const replies = await Promise.allSettled([s.stub.approve(payload, 'owner'), s.stub.approve(payload, 'owner')]); assert.equal(replies.filter(x => x.status === 'fulfilled').length, 1);
  await s.stub.tick(s.due + 1000);
  const current = await s.stub.preview(s.input.id); await assert.rejects(s.stub.save(current, 'owner'), /IMMUTABLE/);
});

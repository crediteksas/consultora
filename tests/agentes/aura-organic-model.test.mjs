import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCalendar, approvalPayload, digest, requireOrganicOwner, learnFromCalendars, jpegDimensions, contentWarnings, boundedBytes } from '../../creditek/workers/aura-meta-ads-api/organic-model.mjs';
import { graph, publicConnection } from '../../creditek/workers/aura-meta-ads-api/organic-meta.mjs';
const now = Date.now();
const draft = () => ({ id: 'calendar_123', title: 'Creditek', revision: 0, pieces: [{ id: 'piece_1234', caption: '¿Qué función usas más en tu celular?', topic: 'Uso cotidiano', format: 'image', asset: 'a'.repeat(64) + '.jpg', channels: ['instagram', 'facebook'], scheduled_at: new Date(now + 86400000).toISOString() }] });
test('calendar validates channels, dates, format, duplicate IDs and size', () => {
  assert.equal(validateCalendar(draft(), now).pieces.length, 1);
  for (const mutate of [d => d.pieces[0].channels.push('whatsapp'), d => d.pieces[0].channels.push('facebook'), d => d.pieces[0].format = 'reel', d => d.pieces.push(d.pieces[0]), d => d.pieces[0].scheduled_at = new Date(now).toISOString(), d => d.pieces[0].asset = 'https://evil.test/x', d => d.pieces[0].caption = 'x'.repeat(2201)]) { const d = draft(); mutate(d); assert.throws(() => validateCalendar(d, now)); }
});
test('approval digest covers caption, image, date, channels and revision, but not results', async () => {
  const c = { ...validateCalendar(draft(), now), revision: 1 }; const hash = await digest(approvalPayload(c));
  for (const mutate of [d => d.pieces[0].caption += '!', d => d.pieces[0].asset = 'b'.repeat(64) + '.jpg', d => d.pieces[0].scheduled_at += 'x', d => d.pieces[0].channels = ['facebook'], d => d.revision++]) { const d = structuredClone(c); mutate(d); assert.notEqual(await digest(approvalPayload(d)), hash); }
  c.pieces[0].results.facebook = { status: 'published' }; assert.equal(await digest(approvalPayload(c)), hash);
});
test('ad publishing permissions do not imply organic calendar approval', () => {
  assert.throws(() => requireOrganicOwner({ access: { apps: [{ role_id: 'meta_ads.manager' }] } }));
  assert.doesNotThrow(() => requireOrganicOwner({ access: { apps: [{ role_id: 'aura.owner' }] } }));
});
test('learning requires enough real comparable data and never invents zeros', () => {
  assert.equal(learnFromCalendars([]).channels.facebook.status, 'insufficient_data');
  const make = (n, missing = false, age = 24) => [{ pieces: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, topic: i % 2 ? 'Consejos' : 'Comunidad', results: { facebook: { published_at: new Date(now).toISOString(), snapshots: [{ age_hours: age, reach: missing ? null : 100, likes: i % 2 ? 10 : 2 }] } } })) }];
  assert.equal(learnFromCalendars(make(7)).channels.facebook.status, 'insufficient_data');
  assert.equal(learnFromCalendars(make(8, true)).channels.facebook.comparable_posts, 0);
  assert.equal(learnFromCalendars(make(8, false, 72)).channels.facebook.comparable_posts, 0);
  const good = learnFromCalendars(make(8)); assert.equal(good.channels.facebook.topics[0].topic, 'Consejos'); assert.equal(good.channels.instagram.comparable_posts, 0); assert.equal(good.automatic_changes_to_approved_content, false);
});
test('unsafe claims are blocked and JPEG input is checked', () => {
  assert.ok(contentWarnings('Aprobación garantizada').length); assert.ok(contentWarnings('$500.000').length); assert.ok(contentWarnings('Solicita crédito').length);
  assert.equal(contentWarnings('Cuida tu celular y disfruta la tecnología.').length, 0);
  assert.throws(() => jpegDimensions(new Uint8Array([1, 2, 3])));
});
test('bounded body rejects actual oversized streams without trusting Content-Length', async () => {
  await assert.rejects(boundedBytes(new Request('https://example.test', { method: 'POST', body: '12345' }), 4));
});
test('Graph cannot call ads or arbitrary URLs; connection never returns token', async () => {
  for (const path of ['act_123/ads', '123/campaigns', 'https://evil.test', '123/../ads']) await assert.rejects(graph({}, 'fake', path));
  const safe = publicConnection({ token: 'PRIVATE', page_id: '123' }, {}); assert.ok(!JSON.stringify(safe).includes('PRIVATE')); assert.equal(safe.automation_enabled, false);
});

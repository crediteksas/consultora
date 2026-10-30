import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import {
  QUICK_REPLY_MAX_LENGTH, createReferenceQuickReply, parseReferenceQuickReply,
  verifyReferenceQuickReply, referenceTemplateButtonInput, processReferenceQuickReply,
} from './reference-quick-reply.mjs';
import { BASELINE_SHA256, transformReferenceReceiver } from './transform.mjs';

const BASELINE = readFileSync(new URL('./production-base.mjs', import.meta.url), 'utf8');
const CANDIDATE = readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-30T18:00:00.000Z');
const SECRET = 'local-fixture-pepper-with-32-bytes-minimum';
const FROM = '573000000001';
const PHONE = 'fixture-nova-phone';
const CONTACT = createHash('sha256').update(SECRET + ':' + FROM.slice(2)).digest('hex');
const CONTEXT = Object.freeze({
  reference_id: '10000000-0000-4000-8000-000000000001',
  application_id: '20000000-0000-4000-8000-000000000002',
  source_application_id: '30000000-0000-4000-8000-000000000003',
  reference_type: 'personal', payload_hash: '1'.repeat(64), contact_hash: CONTACT,
});
const make = (action = 'start', extra = {}) => createReferenceQuickReply({ context: CONTEXT, action, secret: SECRET, now: NOW, ...extra });
const verify = (payload, extra = {}) => verifyReferenceQuickReply({ payload, context: CONTEXT, recipientHash: CONTACT, secret: SECRET, now: NOW, ...extra });
const inbound = (payload, extra = {}) => ({
  id: 'wamid.fixture-1', from: FROM, phoneId: PHONE, at: NOW, verifiedWebhook: true,
  text: payload, referenceInvitationPayload: payload, ...extra,
});

function declaration(source, prefix) {
  const start = source.indexOf(prefix);
  assert.ok(start >= 0, prefix);
  return source.slice(start, source.indexOf('\n', start));
}

function actualFunction(source, name) {
  let start = source.indexOf('async function ' + name + '(');
  if (start < 0) start = source.indexOf('function ' + name + '(');
  const end = source.indexOf('\n__name(' + name + ',', start);
  assert.ok(start >= 0 && end > start, name);
  return source.slice(start, end);
}

// Execute the actual transformed production functions with fake DB and Meta.
// No external fetch is reachable from this harness.
function harness({ sourceActive = true } = {}) {
  const patched = CANDIDATE;
  const hash = async text => createHash('sha256').update(text).digest('hex');
  const key = secret => webcrypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const hashPattern = /^[a-f0-9]{64}$/;
  const sandbox = {
    crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob, structuredClone, AbortSignal,
    __name: fn => fn, hash2: hash, key22: key, key, UUID32: uuid, UUID2: uuid, UUID22: uuid,
    HASH4: hashPattern, HASH2: hashPattern, HASH22: hashPattern, NOVA_PHONE_ID2: PHONE,
    hex22: bytes => Buffer.from(bytes).toString('hex'), hex: bytes => Buffer.from(bytes).toString('hex'),
    referenceTemplateButtonInput, processReferenceQuickReply,
    boundedJson22: response => response.json(),
    runReferenceOtp2: () => { throw Error('UNEXPECTED_OTP_SEND_WITHOUT_EXPLICIT_CONSENT'); },
    referencePhoneVerified2: () => false,
  };
  const choicesEnd = patched.indexOf('function referenceChoiceId(');
  const choicesStart = patched.lastIndexOf('\nvar UUID', choicesEnd) + 1;
  assert.ok(choicesStart > 0 && choicesEnd > choicesStart && choicesEnd - choicesStart < 2000);
  const code = [
    ...['var normalize = ', 'var CONSENT = ', 'var RELATIONS = ', 'var DURATIONS = ', 'var referenceEnabled2 = ', 'var referenceOtpReady2 = '].map(p => declaration(patched, p)),
    patched.slice(choicesStart, choicesEnd),
    ...['advanceReference2', 'referenceChoiceId', 'parseReferenceChoice2', 'referenceWebhookInput', 'referenceReplyPayload2', 'verifyReferenceInvitation', 'referenceInvitation', 'processReferenceMessage'].map(n => actualFunction(patched, n)),
  ].join('\n');
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  const events = new Set(), sent = [], transitions = [], acknowledgements = [];
  let dialogue = null;
  const context = () => ({ ...CONTEXT, dialogue: dialogue ? structuredClone(dialogue) : null });
  const rpc = async (name, args) => {
    if (name === 'nova_reference_for_event') return events.has(args.p_event_id) ? { duplicate: true } : {};
    if (name === 'nova_reference_context') return args.p_reference_id === CONTEXT.reference_id && args.p_contact_hash === CONTACT ? context() : null;
    if (name === 'nova_reference_transition') {
      if (events.has(args.p_event_id)) return { duplicate: true };
      if (args.p_revision !== (dialogue?.revision || 0)) return { ok: false, retryable: true };
      events.add(args.p_event_id); transitions.push(args);
      dialogue = { state: structuredClone(args.p_state), expires_at: args.p_expires_at,
        revision: (dialogue?.revision || 0) + 1, status: args.p_outcome ? 'completed' : 'active', outcome: args.p_outcome };
      return { ok: true, attempt_id: '40000000-0000-4000-8000-000000000004' };
    }
    if (name === 'nova_reference_send_ack') { acknowledgements.push(args); return {}; }
    throw Error('UNEXPECTED_RPC:' + name);
  };
  const env = {
    NOVA_REFERENCES_ENABLED: 'true', NOVA_REFERENCE_INVITATIONS_APPROVED: 'true',
    NOVA_PII_HASH_PEPPER: SECRET, NOVA_META_ACCESS_TOKEN: 'fixture-not-a-token',
    NOVA_REFERENCE_OTP_ENABLED: 'true', NOVA_REFERENCE_OTP_STORAGE_READY: 'true',
    NOVA_REFERENCE_OTP_SECRET: 'local-fixture-otp-secret-not-production',
  };
  const run = message => sandbox.processReferenceMessage(message, env, {
    rpc, verifySource: async () => sourceActive, now: () => NOW,
    fetcher: async (_url, init) => { sent.push(JSON.parse(init.body)); return Response.json({ messages: [{ id: 'fixture-outbound-' + sent.length }] }); },
  });
  return { run, sent, transitions, acknowledgements, context, sandbox, env };
}

test('start and decline payloads are <=128 ASCII characters and carry no phone, fingerprint or UUID text', async () => {
  for (const action of ['start', 'decline']) {
    const payload = await make(action);
    assert.ok(payload.length <= QUICK_REPLY_MAX_LENGTH);
    assert.match(payload, /^[A-Za-z0-9_.-]+$/);
    for (const value of [FROM, CONTACT, CONTEXT.payload_hash, CONTEXT.reference_id]) assert.equal(payload.includes(value), false);
    assert.equal((await verify(payload)).action, action);
  }
});

test('signed action cannot be swapped and tampered signatures are denied', async () => {
  const payload = await make();
  assert.equal(await verify(payload.replace('nrq1.s.', 'nrq1.d.')), null);
  const parts = payload.split('.'); parts[5] = (parts[5][0] === 'A' ? 'B' : 'A') + parts[5].slice(1);
  assert.equal(await verify(parts.join('.')), null);
});

test('reference, fingerprint, recipient, application, source and type are cryptographically bound', async () => {
  const payload = await make();
  for (const [field, value] of [
    ['reference_id', '10000000-0000-4000-8000-000000000099'],
    ['payload_hash', '2'.repeat(64)], ['contact_hash', '3'.repeat(64)],
    ['application_id', '20000000-0000-4000-8000-000000000099'],
    ['source_application_id', '30000000-0000-4000-8000-000000000099'], ['reference_type', 'family'],
  ]) assert.equal(await verify(payload, { context: { ...CONTEXT, [field]: value } }), null, field);
  assert.equal(await verify(payload, { recipientHash: '4'.repeat(64) }), null);
  assert.equal(await verify(payload, { secret: 'different-local-fixture-pepper-32-bytes' }), null);
});

test('expiry is exactly 24 hours; rejects future-issued, expired and extended claims', async () => {
  const payload = await make(), claims = parseReferenceQuickReply(payload);
  assert.equal(claims.expires - claims.issued, 86400);
  assert.equal(await verify(payload, { now: NOW - 1000 }), null);
  assert.ok(await verify(payload, { now: NOW + 86400000 - 1 }));
  assert.equal(await verify(payload, { now: NOW + 86400000 }), null);
  const parts = payload.split('.'); parts[4] = (claims.expires + 1).toString(36);
  assert.equal(parseReferenceQuickReply(parts.join('.')), null);
});

test('malformed, noncanonical, oversized and unsupported payloads are rejected', async () => {
  const payload = await make();
  const invalid = [null, '', 'nrq2.' + payload.slice(5), payload + '.extra', 'nrq1.' + 'x'.repeat(200), payload.replace('nrq1.s.', 'nrq1.x.')];
  const parts = payload.split('.'); parts[3] = '0' + parts[3]; invalid.push(parts.join('.'));
  for (const p of invalid) { assert.equal(parseReferenceQuickReply(p), null); assert.equal(await verify(p), null); }
  await assert.rejects(make('approve'));
  await assert.rejects(make('start', { secret: 'short' }));
});

test('template button adapter uses payload, never its editable visible title', async () => {
  const payload = await make();
  assert.deepEqual(referenceTemplateButtonInput({ type: 'button', button: { payload, text: 'AUTORIZO' } }), { text: payload, referenceInvitationPayload: payload });
  assert.deepEqual(referenceTemplateButtonInput({ type: 'button', button: { payload: 'nrq1.malformed', text: 'Responder referencia' } }), { invalidReferenceQuickReply: true });
  assert.equal(referenceTemplateButtonInput({ type: 'button', button: { payload: 'Contacté al cliente' } }), null);
  assert.equal(referenceTemplateButtonInput({ type: 'text', text: { body: payload } }), null);
  assert.equal(referenceTemplateButtonInput({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: payload } } }), null);
});

test('frozen production transform rejects source drift and applying twice', () => {
  assert.equal(createHash('sha256').update(BASELINE).digest('hex'), BASELINE_SHA256);
  const patched = transformReferenceReceiver(BASELINE);
  assert.match(patched, /processReferenceQuickReply\(message/);
  assert.throws(() => transformReferenceReceiver(BASELINE + '\n'), /BASELINE_CHANGED/);
  assert.throws(() => transformReferenceReceiver(patched), /BASELINE_CHANGED/);
});

test('real production receiver: start opens explicit consent, sends no OTP and records no consent', async () => {
  const h = harness(), payload = await make();
  const input = h.sandbox.referenceWebhookInput({ type: 'button', button: { payload, text: 'Autorizo' } });
  const result = await h.run({ ...inbound(payload), ...input, referenceChoiceId: 'untrusted-extra-value' });
  assert.equal(result.handled, true); assert.equal(result.accepted, true); assert.equal(h.transitions.length, 1);
  assert.equal(h.context().dialogue.state.stage, 'consent');
  assert.notEqual(h.context().dialogue.state.consent, true);
  assert.equal(h.sent[0].type, 'interactive');
  assert.deepEqual(h.sent[0].interactive.action.buttons.map(b => b.reply.title), ['Autorizo', 'No autorizo']);
});

test('real production receiver: same Meta event replays cause no second transition or message', async () => {
  const h = harness(), message = inbound(await make());
  await h.run(message); const result = await h.run(message);
  assert.equal(result.duplicate, true); assert.equal(h.transitions.length, 1); assert.equal(h.sent.length, 1);
});

test('real production receiver: repeated start preserves ongoing dialogue without new send', async () => {
  const h = harness(), payload = await make();
  await h.run(inbound(payload));
  const before = JSON.stringify(h.context().dialogue);
  await h.run(inbound(payload, { id: 'wamid.fixture-distinct-tap' }));
  assert.equal(JSON.stringify(h.context().dialogue), before);
  assert.equal(h.sent.length, 1); assert.equal(h.transitions.length, 1);
});

test('real production receiver: decline records rejection and replay does not resend', async () => {
  const h = harness(), message = inbound(await make('decline'));
  await h.run(message); await h.run(message);
  assert.equal(h.context().dialogue.state.stage, 'declined');
  assert.equal(h.context().dialogue.state.consent, false);
  assert.equal(h.context().dialogue.outcome, 'declined');
  assert.equal(h.transitions.length, 1); assert.equal(h.sent.length, 1);
});

test('real production receiver: legacy links still open the same consent flow', async () => {
  const h = harness(), invitation = await h.sandbox.referenceInvitation(CONTEXT, SECRET, NOW);
  const input = h.sandbox.referenceWebhookInput({ type: 'text', text: { body: 'REFERENCIA ' + invitation.token } });
  // Remove the test-only compact-property to represent a real legacy message.
  const legacy = { ...inbound(invitation.token), ...input }; delete legacy.referenceInvitationPayload;
  const h2 = harness(); await h2.run(legacy);
  assert.equal(h2.context().dialogue.state.stage, 'consent'); assert.equal(h2.sent.length, 1);
});

test('real production receiver: invalid prefixed button is consumed, not treated as free text', () => {
  const h = harness();
  const input = h.sandbox.referenceWebhookInput({ type: 'button', button: { payload: 'nrq1.bad', text: 'Autorizo' } });
  assert.equal(input.invalidReferenceChoice, true);
  assert.equal(input.text, undefined);
});

test('real production receiver: forwarded button and revoked source cannot change state or send', async () => {
  const payload = await make();
  const wrong = harness(); const result = await wrong.run(inbound(payload, { from: '573000000002' }));
  assert.equal(result.handled, true); assert.equal(wrong.transitions.length, 0); assert.equal(wrong.sent.length, 0);
  const revoked = harness({ sourceActive: false }); await revoked.run(inbound(payload));
  assert.equal(revoked.transitions.length, 0); assert.equal(revoked.sent.length, 0);
});

test('receiver denies unverified, wrong-channel, stale and future envelopes before context lookup', async () => {
  const payload = await make(); let reads = 0, processed = 0;
  for (const extra of [{ verifiedWebhook: false }, { phoneId: 'other' }, { at: NOW + 1 }, { at: NOW - 23 * 3600000 }, { id: '' }, { id: undefined }]) {
    const result = await processReferenceQuickReply(inbound(payload, extra), {
      secret: SECRET, expectedPhoneId: PHONE, now: NOW,
      readContext: async () => { reads++; return CONTEXT; }, processReference: async () => { processed++; },
    });
    assert.equal(result.handled, true); assert.equal(result.ignored, true);
  }
  assert.equal(reads, 0); assert.equal(processed, 0);
});

test('database failure propagates for webhook retry; it is never silently acknowledged', async () => {
  await assert.rejects(processReferenceQuickReply(inbound(await make()), {
    secret: SECRET, expectedPhoneId: PHONE, now: NOW,
    readContext: async () => { throw Error('fixture-database-unavailable'); },
    processReference: async () => assert.fail('must not process'),
  }), /database-unavailable/);
});

test('bridge preserves compact expiry instead of granting a fresh 24-hour link', async () => {
  const issuedAt = NOW - 86399000, payload = await make('start', { now: issuedAt });
  let normalized;
  await processReferenceQuickReply(inbound(payload), {
    secret: SECRET, expectedPhoneId: PHONE, now: NOW,
    readContext: async () => CONTEXT, processReference: async message => { normalized = message; return { handled: true }; },
  });
  const token = /^REFERENCIA ([A-Za-z0-9_.-]+)$/.exec(normalized.text)[1];
  const h = harness(), legacy = await h.sandbox.verifyReferenceInvitation(token, SECRET, NOW);
  assert.equal(legacy.expires * 1000, issuedAt + 86400000);
  assert.equal(legacy.issued * 1000, issuedAt);
  assert.equal(await h.sandbox.verifyReferenceInvitation(token, SECRET, NOW + 1000), null);
});

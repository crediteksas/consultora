import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';
import { createReferenceQuickReply, verifyReferenceQuickReply } from './reference-quick-reply.mjs';
import {
  REFERENCE_TEMPLATE, REFERENCE_TEMPLATE_V1, PINNED_LOGO_URL, PINNED_LOGO_SHA256,
  templateHealth, referenceTemplateMessageComponents,
} from './meta-preflight.mjs';
import { buildReferenceInvitationTemplate } from './reference-dispatch.mjs';

// Test the bundled candidate in this release. All transport is intercepted.
// This never imports or executes the full Worker.
const candidate = readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');
const v2Test = (name, fn) => test(name, fn);
const NOW = Date.parse('2026-10-30T18:00:00Z');
const SECRET = 'sender-fixture-pepper-more-than-32-bytes';
const SOURCE = '10000000-0000-4000-8000-000000000001';
const APP = '20000000-0000-4000-8000-000000000002';
const REF = '30000000-0000-4000-8000-000000000003';
const ATTEMPT = '40000000-0000-4000-8000-000000000004';
const PHONE = '3000000001';
const CONTACT = createHash('sha256').update(SECRET + ':' + PHONE).digest('hex');
const CONTEXT = {
  reference_id: REF, application_id: APP, source_application_id: SOURCE,
  payload_hash: '1'.repeat(64), contact_hash: CONTACT, reference_type: 'personal', dialogue: null,
};

function actualFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  const end = source.indexOf('\n__name(' + name + ',', start);
  assert.ok(start >= 0 && end > start, 'Complete actual ' + name + ' must be present');
  return source.slice(start, end);
}

function harness({ version = 'v2', preexisting, meta = 'accepted', changedSource, secret = SECRET,
  invalidLogo = false, invalidName = false, invalidContext = false, sourceRevoked = false,
  headerVerified = true, v1Approved = true, changedAtRead = 2 } = {}) {
  const calls = [], metaMessages = [], finishes = [], states = new Map(preexisting ? [[REF, preexisting]] : []);
  const recipientHash = createHash('sha256').update(secret + ':' + PHONE).digest('hex');
  const referenceContext = { ...CONTEXT, contact_hash: recipientHash };
  const original = {
    solicitud_id: SOURCE, revoked_at: sourceRevoked ? new Date(NOW).toISOString() : null, consent: { granted: true },
    registration: { p_origen_codigo: 'CK-05', p_nombre_completo: invalidName ? 'invalid\nname' : 'Fixture customer', p_celular: '3000000099' },
  };
  const expected = [{ type: 'personal', telefono: PHONE, contact_authorized: true }];
  let sourceReads = 0, active = original, legacyInvites = 0;
  const state = {
    checkedAt: NOW, referenceV1: v1Approved ? 'APPROVED' : 'PENDING',
    referenceV2: version === 'v2' ? 'APPROVED' : 'PENDING', staff: 'APPROVED',
    headerVerified, headerUrl: PINNED_LOGO_URL, headerSha256: PINNED_LOGO_SHA256, headerCheckedAt: NOW,
    // Support the old cache only when testing the unmodified baseline V1 path.
    ready: true, reference: 'APPROVED',
  };
  const env = {
    NOVA_RETAIL_ENABLED: 'true', NOVA_PII_HASH_PEPPER: secret,
    NOVA_PHONE_NUMBER_ID: 'fixture-nova-phone', NOVA_META_ACCESS_TOKEN: 'fixture-not-a-token',
    KORA_SUPABASE_SERVICE_ROLE_KEY: 'fixture-db-key', SUPABASE_SERVICE_ROLE_KEY: 'fixture-db-key',
    NOVA_EVENTS: { get: async () => structuredClone(state) },
  };
  const fetcher = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const body = init.body ? JSON.parse(init.body) : null;
    if (url.hostname === 'graph.facebook.com') {
      assert.equal(url.pathname, '/v26.0/fixture-nova-phone/messages');
      calls.push('meta'); metaMessages.push(body);
      if (meta === 'throw') throw Error('fixture-transport-timeout');
      if (meta === '500') return Response.json({ error: { code: 2 } }, { status: 500 });
      if (meta === '400') return Response.json({ error: { code: 131000 } }, { status: 400 });
      return Response.json({ messages: [{ id: 'fixture-message-1' }] });
    }
    assert.ok(['fixture-kora.invalid', 'fixture-aura.invalid'].includes(url.hostname), 'Unexpected outbound URL');
    const path = url.pathname.replace('/rest/v1/', '');
    if (path === 'kora_nova_sources') {
      sourceReads++;
      active = sourceReads >= changedAtRead && changedSource ? { ...structuredClone(original), ...structuredClone(changedSource) } : original;
      calls.push('source:' + sourceReads);
      return Response.json([active]);
    }
    if (path === 'rpc/kora_nova_effective_references') return Response.json(active.effectiveReferences || expected);
    if (path === 'nova_retail_cases') return Response.json([{ state: 'waiting', delivered_at: null }]);
    if (path === 'nova_registration_receipts') return Response.json([{ application_id: APP, payload_hash: '1'.repeat(64) }]);
    if (path === 'nova_reference_verifications') return Response.json([{ id: REF, reference_type: 'personal', contact_hash: recipientHash }]);
    if (path === 'rpc/nova_reference_context') return Response.json(invalidContext ? { ...referenceContext, payload_hash: 'invalid' } : referenceContext);
    if (path === 'rpc/nova_retail_candidates') return Response.json([SOURCE]);
    if (path === 'rpc/nova_retail_reference_reserve') {
      calls.push('reserve');
      assert.deepEqual(body, { p_reference: REF, p_source: SOURCE, p_contact_hash: recipientHash });
      if (states.has(REF)) return Response.json(null);
      states.set(REF, 'reserved'); return Response.json(ATTEMPT);
    }
    if (path === 'rpc/nova_retail_reference_finish') {
      calls.push('finish'); finishes.push(body); states.set(REF, body.p_state); return Response.json({});
    }
    throw Error('Unexpected database operation: ' + path);
  };
  const wrappedHealth = async env => {
    const health = await templateHealth(env, { now: () => NOW });
    return invalidLogo ? { ...health, ready: true, selectedVersion: 'v2', selectedReference: REFERENCE_TEMPLATE.name,
      headerUrl: 'https://invalid-logo.invalid/logo.png', logoLink: 'https://invalid-logo.invalid/logo.png' } : { ...health, logoLink: health.headerUrl };
  };
  const wrappedCreate = async args => { calls.push('payload:' + args.action); return createReferenceQuickReply(args); };
  const wrappedComponents = (...args) => { calls.push('components'); return referenceTemplateMessageComponents(...args); };
  const wrappedBuild = async args => { const result = await buildReferenceInvitationTemplate(args); calls.push('components'); return result; };
  const sandbox = {
    crypto: webcrypto, TextEncoder, TextDecoder, Response, Request, Headers, AbortSignal,
    console: { warn: () => {} }, __name: fn => fn,
    KORA3: 'https://fixture-kora.invalid', AURA5: 'https://fixture-aura.invalid',
    KORA: 'https://fixture-kora.invalid', AURA: 'https://fixture-aura.invalid',
    UUID6: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,
    UUID: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,
    RETAIL_STORES: Array.from({ length: 9 }, (_, i) => 'CK-0' + (i + 1)),
    sha: async value => createHash('sha256').update(value).digest('hex'),
    templateHealth: wrappedHealth, REFERENCE_TEMPLATE, REFERENCE_TEMPLATE_V1,
    createReferenceQuickReply: wrappedCreate, createReferenceQuickReply2: wrappedCreate,
    referenceTemplateMessageComponents: wrappedComponents, referenceTemplateMessageComponents2: wrappedComponents,
    buildReferenceInvitationTemplate: wrappedBuild,
  };
  vm.createContext(sandbox); vm.runInContext(actualFunction(candidate, 'createRetailRuntime'), sandbox);
  const runtime = sandbox.createRetailRuntime({ fetcher, now: () => NOW, makeInvitation: async () => {
    legacyInvites++; calls.push('legacy-invitation'); return { url: 'https://wa.me/fixture?text=REFERENCIA%20legacy-fixture', expiresAt: new Date(NOW + 86400000).toISOString() };
  } });
  return { env, runtime, calls, metaMessages, finishes, states, legacyInvites: () => legacyInvites, context: referenceContext };
}

test('complete createRetailRuntime and sender are extracted, not string-only mocked', () => {
  const source = actualFunction(candidate, 'createRetailRuntime');
  assert.match(source, /async function sendReferences/);
  assert.match(source, /nova_retail_reference_reserve/);
  assert.match(source, /nova_retail_reference_finish/);
});

v2Test('V2 sender uses logo and two real signed action payloads before reserve', async () => {
  const h = harness(); await h.runtime.sendReferences(h.env, SOURCE);
  assert.equal(h.metaMessages.length, 1);
  const message = h.metaMessages[0];
  assert.equal(message.to, '57' + PHONE); assert.equal(message.template.name, REFERENCE_TEMPLATE.name);
  const components = message.template.components;
  assert.deepEqual(components[0], { type: 'header', parameters: [{ type: 'image', image: { link: PINNED_LOGO_URL } }] });
  assert.deepEqual(components[1], { type: 'body', parameters: [{ type: 'text', text: 'Fixture customer' }] });
  assert.equal(components.length, 4);
  for (const [i, action] of ['start', 'decline'].entries()) {
    const button = components[i + 2], payload = button.parameters[0].payload;
    assert.equal(button.type, 'button'); assert.equal(button.sub_type, 'quick_reply'); assert.equal(button.index, String(i));
    assert.ok(payload.length <= 128);
    assert.equal((await verifyReferenceQuickReply({ payload, context: CONTEXT, recipientHash: CONTACT, secret: SECRET, now: NOW })).action, action);
  }
  assert.ok(h.calls.includes('components')); assert.ok(h.calls.indexOf('components') < h.calls.indexOf('reserve'));
  assert.equal(h.legacyInvites(), 0); assert.equal(h.finishes[0].p_state, 'accepted');
});

v2Test('accepted and uncertain dispatches are never sent again', async () => {
  for (const preexisting of ['accepted', 'uncertain']) {
    const h = harness({ preexisting }); await h.runtime.sendReferences(h.env, SOURCE);
    assert.equal(h.metaMessages.length, 0, preexisting); assert.equal(h.finishes.length, 0, preexisting);
  }
});

v2Test('transport acceptance, timeout and HTTP500 remain distinct and cannot duplicate sends', async () => {
  for (const meta of ['accepted', 'throw', '500']) {
    const h = harness({ meta }); await h.runtime.sendReferences(h.env, SOURCE); await h.runtime.sendReferences(h.env, SOURCE);
    assert.equal(h.metaMessages.length, 1, meta); assert.equal(h.finishes.length, 1, meta);
    assert.equal(h.finishes[0].p_state, meta === 'accepted' ? 'accepted' : 'uncertain');
    assert.equal(h.finishes[0].p_message_id, meta === 'accepted' ? 'fixture-message-1' : null);
  }
});

v2Test('invalid logo, secret, name or context never reserves or records an uncertain send', async () => {
  for (const options of [{ invalidLogo: true }, { secret: 'short' }, { invalidName: true }, { invalidContext: true }]) {
    const h = harness(options); await h.runtime.sendReferences(h.env, SOURCE);
    assert.equal(h.calls.includes('reserve'), false, JSON.stringify(options));
    assert.equal(h.metaMessages.length, 0); assert.equal(h.finishes.length, 0);
  }
});

v2Test('fresh source revocation, loss of consent and changed recipient block dispatch', async () => {
  for (const changedSource of [
    { revoked_at: new Date(NOW).toISOString() }, { consent: { granted: false } },
    { effectiveReferences: [{ type: 'personal', telefono: '3000000002', contact_authorized: true }] },
    { effectiveReferences: [{ type: 'personal', telefono: PHONE, contact_authorized: false }] },
  ]) {
    const h = harness({ changedSource }); await h.runtime.sendReferences(h.env, SOURCE);
    assert.equal(h.metaMessages.length, 0, JSON.stringify(changedSource));
    assert.equal(h.calls.includes('reserve'), false, JSON.stringify(changedSource));
    assert.equal(h.finishes.length, 0);
  }
});

v2Test('header verification failure with no approved V1 produces no reservation or send', async () => {
  const h = harness({ headerVerified: false, v1Approved: false }); await h.runtime.sendReferences(h.env, SOURCE);
  assert.equal(h.metaMessages.length, 0); assert.equal(h.calls.includes('reserve'), false); assert.equal(h.finishes.length, 0);
});

v2Test('source change only after reservation is failed without falsely recording a possible Meta send', async () => {
  const h = harness({ changedSource: { revoked_at: new Date(NOW).toISOString() }, changedAtRead: 3 });
  await h.runtime.sendReferences(h.env, SOURCE);
  assert.equal(h.calls.includes('reserve'), true); assert.equal(h.metaMessages.length, 0);
  assert.equal(h.finishes.length, 1); assert.equal(h.finishes[0].p_state, 'failed');
  assert.equal(h.finishes[0].p_message_id, null);
});

v2Test('V1 fallback preserves its name and exactly two legacy body parameters', async () => {
  const h = harness({ version: 'v1' }); await h.runtime.sendReferences(h.env, SOURCE);
  assert.equal(h.metaMessages.length, 1);
  const template = h.metaMessages[0].template;
  assert.equal(template.name, REFERENCE_TEMPLATE_V1.name); assert.equal(template.language.code, 'es_CO');
  assert.deepEqual(template.components, [{ type: 'body', parameters: [
    { type: 'text', text: 'Fixture customer' }, { type: 'text', text: 'https://wa.me/fixture?text=REFERENCIA%20legacy-fixture' },
  ] }]);
  assert.equal(h.legacyInvites(), 1);
  assert.equal(h.calls.some(call => call.startsWith('payload:')), false);
});

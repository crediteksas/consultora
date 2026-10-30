import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { createReferenceQuickReply, referenceTemplateButtonInput } from './reference-quick-reply.mjs';

const source = readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');
const APP_SECRET = 'webhook-signature-fixture-not-production';
const NOW = Date.parse('2026-10-30T18:00:00Z');
const FROM = '573000000001';
const REFERENCE = '10000000-0000-4000-8000-000000000001';

function actualFunction(name) {
  let start = source.indexOf('async function ' + name + '(');
  if (start < 0) start = source.indexOf('function ' + name + '(');
  const end = source.indexOf('\n__name(' + name + ',', start);
  assert.ok(start >= 0 && end > start, name);
  return source.slice(start, end);
}

function declaration(prefix) {
  const start = source.indexOf(prefix);
  assert.ok(start >= 0, prefix);
  return source.slice(start, source.indexOf('\n', start));
}

function harness(processResult = async () => ({ handled: true })) {
  const processed = [], pilot = [], diagnostics = [];
  const sandbox = { crypto: webcrypto, TextEncoder, TextDecoder, Response, __name: fn => fn,
    referenceTemplateButtonInput, console: { warn: () => {} },
    novaDiagnostic: async (...args) => diagnostics.push(args),
  };
  const choiceEnd = source.indexOf('function referenceChoiceId(');
  const choiceStart = source.lastIndexOf('\nvar UUID', choiceEnd) + 1;
  assert.ok(choiceStart > 0 && choiceEnd - choiceStart < 2000);
  const code = [
    declaration('var WABA_ID = '), declaration('var NOVA_PHONE_ID2 = '), declaration('var referenceEnabled2 = '),
    source.slice(choiceStart, choiceEnd),
    ...['referenceChoiceId', 'parseReferenceChoice2', 'referenceWebhookInput', 'validSignature', 'withReferenceWebhook'].map(actualFunction),
  ].join('\n');
  vm.createContext(sandbox); vm.runInContext(code, sandbox);
  const env = { NOVA_REFERENCES_ENABLED: 'true', NOVA_REFERENCE_INVITATIONS_APPROVED: 'true',
    NOVA_PII_HASH_PEPPER: 'fixture-pepper-at-least-32-bytes-long', NOVA_META_ACCESS_TOKEN: 'fixture-token', NOVA_META_APP_SECRET: APP_SECRET };
  const envelope = messages => ({ object: 'whatsapp_business_account', entry: [{ id: sandbox.WABA_ID,
    changes: [{ field: 'messages', value: { metadata: { phone_number_id: sandbox.NOVA_PHONE_ID2 }, messages } }] }] });
  const message = (id, extra) => ({ id, from: FROM, timestamp: String(NOW / 1000), ...extra });
  const run = async (messages, { badSignature = false } = {}) => {
    const raw = JSON.stringify(envelope(messages));
    const signature = 'sha256=' + (badSignature ? '0'.repeat(64) : createHmac('sha256', APP_SECRET).update(raw).digest('hex'));
    const request = new Request('https://fixture.invalid/pilot/webhook', { method: 'POST', headers: {
      'content-type': 'application/json', 'x-hub-signature-256': signature,
    }, body: raw });
    return sandbox.withReferenceWebhook(request, env, async (original, excluded) => {
      const body = await original.json();
      const messages = body.entry.flatMap(e => e.changes.flatMap(c => c.value.messages));
      pilot.push({ excluded: [...excluded], messages, eligibleText: messages.filter(m => !excluded.includes(m.id) && m.type === 'text') });
      return new Response('fixture-pilot-OK');
    }, { process: async input => { processed.push(input); return processResult(input); } });
  };
  return { sandbox, env, message, run, processed, pilot, diagnostics };
}

const payload = () => createReferenceQuickReply({ action: 'start', secret: 'fixture-pepper-at-least-32-bytes-long', now: NOW,
  context: { reference_id: REFERENCE, application_id: '20000000-0000-4000-8000-000000000002',
    source_application_id: '30000000-0000-4000-8000-000000000003', reference_type: 'personal', payload_hash: '1'.repeat(64), contact_hash: '2'.repeat(64) } });

test('real signed wrapper converts template QUICK_REPLY and supplies only authenticated webhook identity', async () => {
  const h = harness(), p = await payload();
  const response = await h.run([h.message('wamid.button-start', { type: 'button', button: { payload: p, text: 'Autorizo' } })]);
  assert.equal(response.status, 200); assert.equal(h.processed.length, 1);
  const input = h.processed[0];
  assert.equal(input.referenceInvitationPayload, p); assert.equal(input.text, p);
  assert.equal(input.id, 'wamid.button-start'); assert.equal(input.from, FROM);
  assert.equal(input.phoneId, h.sandbox.NOVA_PHONE_ID2); assert.equal(input.at, NOW); assert.equal(input.verifiedWebhook, true);
  assert.equal(input.referenceChoiceId, undefined); assert.equal(input.button, undefined);
  assert.deepEqual(h.pilot[0].excluded, ['wamid.button-start']); assert.equal(h.pilot[0].eligibleText.length, 0);
});

test('real signed wrapper excludes malformed owned payload without processing or free-text fallthrough', async () => {
  const h = harness();
  const response = await h.run([h.message('wamid.invalid', { type: 'button', button: { payload: 'nrq1.bad', text: 'Autorizo' } })]);
  assert.equal(response.status, 200); assert.equal(h.processed.length, 0); assert.equal(h.diagnostics.length, 0);
  assert.deepEqual(h.pilot[0].excluded, ['wamid.invalid']); assert.equal(h.pilot[0].eligibleText.length, 0);
});

test('real wrapper rejects bad HMAC before processing, diagnostics or pilot handling', async () => {
  const h = harness();
  const response = await h.run([h.message('wamid.bad-signature', { type: 'text', text: { body: 'hola' } })], { badSignature: true });
  assert.equal(response.status, 401); assert.equal(h.processed.length, 0);
  assert.equal(h.pilot.length, 0); assert.equal(h.diagnostics.length, 0);
});

test('real wrapper preserves reference interactive choices and ordinary text routing', async () => {
  const h = harness(async input => input.referenceChoiceId ? { handled: true } : { ignored: true });
  const choiceId = h.sandbox.referenceChoiceId(REFERENCE, 'consent', 'yes');
  const response = await h.run([
    h.message('wamid.consent', { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: choiceId, title: 'untrusted label' } } }),
    h.message('wamid.text', { type: 'text', text: { body: 'consulta general' } }),
    h.message('wamid.other-button', { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'other-flow', title: 'Autorizo' } } }),
  ]);
  assert.equal(response.status, 200); assert.equal(h.processed.length, 2);
  assert.equal(h.processed[0].text, 'Autorizo'); assert.equal(h.processed[0].referenceChoiceId, choiceId);
  assert.equal(h.processed[0].referenceInvitationPayload, undefined);
  assert.equal(h.processed[1].text, 'consulta general'); assert.equal(h.processed[1].referenceInvitationPayload, undefined);
  assert.deepEqual(h.pilot[0].excluded, ['wamid.consent']);
  assert.deepEqual(h.pilot[0].eligibleText.map(m => m.id), ['wamid.text']);
});

test('real signed wrapper returns 503 on processing failure instead of acknowledging and falling through', async () => {
  for (const process of [async () => ({ ok: false, retryable: true }), async () => { throw Error('fixture-db-unavailable'); }]) {
    const h = harness(process), p = await payload();
    const response = await h.run([h.message('wamid.retry', { type: 'button', button: { payload: p, text: 'Responder referencia' } })]);
    assert.equal(response.status, 503); assert.equal(h.processed.length, 1); assert.equal(h.pilot.length, 0);
  }
});

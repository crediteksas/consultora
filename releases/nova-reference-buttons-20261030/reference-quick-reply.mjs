// Isolated NOVA integration module. No network, persistence, logging or sends.
// The signed compact payload is only a routing capability, never consent.
export const QUICK_REPLY_PREFIX = 'nrq1.';
export const QUICK_REPLY_TTL_SECONDS = 86400;
export const QUICK_REPLY_MAX_LENGTH = 128;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const ACTIONS = Object.freeze({ start: 's', decline: 'd' });
const textEncoder = new TextEncoder();

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodeBase64url(value, bytes) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const decoded = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    return decoded.length === bytes && base64url(decoded) === value ? decoded : null;
  } catch { return null; }
}

function compactId(id) {
  return base64url(Uint8Array.from(id.replace(/-/g, '').match(/../g), h => parseInt(h, 16)));
}

function expandedId(value) {
  const bytes = decodeBase64url(value, 16);
  if (!bytes) return null;
  const h = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  const id = [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join('-');
  return UUID.test(id) ? id : null;
}

function seconds(now) {
  if (!Number.isSafeInteger(now) || now < 0) return null;
  return Math.floor(now / 1000);
}

function contextValid(context) {
  return context && UUID.test(context.reference_id) && UUID.test(context.application_id)
    && UUID.test(context.source_application_id) && HASH.test(context.payload_hash)
    && HASH.test(context.contact_hash) && ['family', 'personal'].includes(context.reference_type);
}

function secretValid(secret) {
  return typeof secret === 'string' && textEncoder.encode(secret).byteLength >= 32;
}

function signingData(claims, context) {
  return textEncoder.encode(JSON.stringify([
    'NOVA:REFERENCE:QUICK_REPLY:V1', claims.action, claims.id,
    context.application_id, context.source_application_id, context.reference_type,
    context.payload_hash, context.contact_hash, claims.issued, claims.expires,
  ]));
}

async function signingKey(secret) {
  return crypto.subtle.importKey('raw', textEncoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** Parse untrusted routing claims only. A parsed payload has NOT been verified. */
export function parseReferenceQuickReply(payload) {
  if (typeof payload !== 'string' || payload.length > QUICK_REPLY_MAX_LENGTH) return null;
  const parts = payload.split('.');
  if (parts.length !== 6 || parts[0] !== 'nrq1' || !['s', 'd'].includes(parts[1])) return null;
  const id = expandedId(parts[2]);
  const readTime = value => {
    if (!/^[0-9a-z]{1,10}$/.test(value)) return null;
    const n = parseInt(value, 36);
    return Number.isSafeInteger(n) && n >= 0 && n.toString(36) === value ? n : null;
  };
  const issued = readTime(parts[3]), expires = readTime(parts[4]);
  if (!id || issued === null || expires === null || expires - issued !== QUICK_REPLY_TTL_SECONDS
    || !decodeBase64url(parts[5], 32)) return null;
  return { action: parts[1] === 's' ? 'start' : 'decline', id, issued, expires, signature: parts[5] };
}

export async function createReferenceQuickReply({ context, action, secret, now = Date.now() }) {
  const issued = seconds(now);
  if (!contextValid(context) || !ACTIONS[action] || !secretValid(secret) || issued === null) throw Error('INVALID_REFERENCE_QUICK_REPLY');
  const claims = { action, id: context.reference_id, issued, expires: issued + QUICK_REPLY_TTL_SECONDS };
  const signature = base64url(new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(secret), signingData(claims, context))));
  const payload = ['nrq1', ACTIONS[action], compactId(claims.id), claims.issued.toString(36), claims.expires.toString(36), signature].join('.');
  if (payload.length > QUICK_REPLY_MAX_LENGTH) throw Error('REFERENCE_QUICK_REPLY_TOO_LONG');
  return payload;
}

export async function verifyReferenceQuickReply({ payload, context, recipientHash, secret, now = Date.now() }) {
  const claims = parseReferenceQuickReply(payload), current = seconds(now);
  if (!claims || !contextValid(context) || !secretValid(secret) || current === null
    || !HASH.test(recipientHash) || context.contact_hash !== recipientHash
    || context.reference_id !== claims.id || claims.issued > current || claims.expires <= current) return null;
  const valid = await crypto.subtle.verify('HMAC', await signingKey(secret), decodeBase64url(claims.signature, 32), signingData(claims, context));
  return valid ? { action: claims.action, id: claims.id, issued: claims.issued, expires: claims.expires } : null;
}

/** Template QUICK_REPLY is type=button; interactive.button_reply stays legacy. */
export function referenceTemplateButtonInput(message) {
  if (message?.type !== 'button' || typeof message.button?.payload !== 'string'
    || !message.button.payload.startsWith(QUICK_REPLY_PREFIX)) return null;
  return parseReferenceQuickReply(message.button.payload)
    ? { text: message.button.payload, referenceInvitationPayload: message.button.payload }
    : { invalidReferenceQuickReply: true };
}

async function contactHash(secret, from) {
  const bytes = await crypto.subtle.digest('SHA-256', textEncoder.encode(secret + ':' + from.slice(2)));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Internal compatibility bridge, not sent or exposed to the WhatsApp user.
// It preserves the original expiry and uses the existing V1 invitation verifier.
async function legacyCommand(claims, context, secret) {
  const payload = base64url(textEncoder.encode(JSON.stringify({
    v: 1, id: claims.id, fp: context.payload_hash, issued: claims.issued, expires: claims.expires,
  })));
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(secret), textEncoder.encode('NOVA:REFERENCE:V1:' + payload)));
  const hex = [...mac].map(b => b.toString(16).padStart(2, '0')).join('');
  return 'REFERENCIA ' + payload + '.' + hex + (claims.action === 'decline' ? ' NO AUTORIZO' : '');
}

/**
 * Call only from the authenticated NOVA webhook wrapper. Context-load failures
 * intentionally propagate: the outer wrapper must return 503, not silently ACK.
 * processReference MUST be the existing processReferenceMessage, which rechecks
 * source/current reference, persists the event atomically, and handles all sends.
 * No client text/title is used as permission or as a reference identifier.
 */
export async function processReferenceQuickReply(message, {
  secret, expectedPhoneId, readContext, processReference, now = Date.now(),
}) {
  const invalid = reason => ({ handled: true, ignored: true, diagnostic: reason });
  const claims = parseReferenceQuickReply(message?.referenceInvitationPayload);
  const current = seconds(now);
  if (!claims || !secretValid(secret) || current === null) return invalid('quick_reply_invalid');
  if (message.verifiedWebhook !== true || typeof expectedPhoneId !== 'string' || !expectedPhoneId
    || message.phoneId !== expectedPhoneId || !/^573\d{9}$/.test(message.from)
    || typeof message.id !== 'string' || !/^[-A-Za-z0-9._=]{1,200}$/.test(message.id) || !Number.isFinite(message.at)
    || message.at > now || now - message.at >= 23 * 3600000
    || claims.issued > current || claims.expires <= current) return invalid('quick_reply_invalid');
  if (typeof readContext !== 'function' || typeof processReference !== 'function') throw Error('QUICK_REPLY_INTEGRATION_UNAVAILABLE');
  const recipientHash = await contactHash(secret, message.from);
  const context = await readContext({ referenceId: claims.id, contactHash: recipientHash });
  const verified = await verifyReferenceQuickReply({ payload: message.referenceInvitationPayload, context, recipientHash, secret, now });
  if (!verified) return invalid('quick_reply_invalid');
  // Do not forward arbitrary extra fields, button text, or a supplied choice id.
  return processReference({
    id: message.id, from: message.from, phoneId: expectedPhoneId,
    at: message.at, verifiedWebhook: true, text: await legacyCommand(verified, context, secret),
  });
}

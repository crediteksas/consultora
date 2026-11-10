import { createHash } from 'node:crypto';

export const BASELINE_SHA256 = '18b11dc3907fa57ad67c0756932db78684c3d74634924987e73a8481e4e6ada5';

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw Error('REFERENCE_RECEIVER_ANCHOR_CHANGED');
  return source.replace(before, after);
}

// Pure source transform: no filesystem writes, credentials, Meta or deploys.
// Run FIRST against the frozen baseline, then compose template/sender changes.
export function transformReferenceReceiver(source) {
  if (createHash('sha256').update(source).digest('hex') !== BASELINE_SHA256) throw Error('REFERENCE_RECEIVER_BASELINE_CHANGED');
  let candidate = replaceOnce(source,
    'function referenceWebhookInput(message) {\n  if (message?.type === "text") return { text: message.text?.body };',
    'function referenceWebhookInput(message) {\n  const templateButton = referenceTemplateButtonInput(message);\n  if (templateButton) return templateButton.invalidReferenceQuickReply ? { invalidReferenceChoice: true } : templateButton;\n  if (message?.type === "text") return { text: message.text?.body };');
  candidate = replaceOnce(candidate,
    '  const contactHash = await hash2(env.NOVA_PII_HASH_PEPPER + ":" + message.from.slice(2));\n  const match = /^REFERENCIA ([A-Za-z0-9_.-]+)(?: (NO AUTORIZO))?$/i.exec(message.text.trim());',
    '  const contactHash = await hash2(env.NOVA_PII_HASH_PEPPER + ":" + message.from.slice(2));\n  if (Object.prototype.hasOwnProperty.call(message, "referenceInvitationPayload")) return processReferenceQuickReply(message, {\n    secret: env.NOVA_PII_HASH_PEPPER, expectedPhoneId: NOVA_PHONE_ID2, now: now(),\n    readContext: ({ referenceId, contactHash }) => rpc("nova_reference_context", { p_reference_id: referenceId, p_contact_hash: contactHash }),\n    processReference: (normalized) => processReferenceMessage(normalized, env, { rpc, verifySource, fetcher, now })\n  });\n  const match = /^REFERENCIA ([A-Za-z0-9_.-]+)(?: (NO AUTORIZO))?$/i.exec(message.text.trim());');
  return 'import { referenceTemplateButtonInput, processReferenceQuickReply } from "./reference-quick-reply.mjs";\n' + candidate;
}

import { createHash } from 'node:crypto';

const EXPECTED_PROCESS_SHA256 = 'abf3868bbf4be9f1a3274a2dd08693a8c1d6a54475f323714e6cc87394ff87ed';
const digest = (text) => createHash('sha256').update(text).digest('hex');
function replaceOne(text, before, after, label) {
  if (text.split(before).length !== 2) throw Error('REF_REPAIR_ANCHOR_DRIFT:' + label);
  return text.replace(before, after);
}

/** Compose against the captured function only; refuse unknown or already patched code. */
export function transformNova(source) {
  if (typeof source !== 'string') throw TypeError('SOURCE_REQUIRED');
  const start = source.indexOf('async function processReferenceMessage(');
  const end = source.indexOf('\n__name(processReferenceMessage,', start);
  if (start < 0 || end <= start || source.indexOf('async function processReferenceMessage(', start + 1) !== -1) throw Error('REF_REPAIR_FUNCTION_DRIFT');
  let process = source.slice(start, end);
  if (digest(process) !== EXPECTED_PROCESS_SHA256) throw Error('REF_REPAIR_PROCESS_HASH_DRIFT');
  process = replaceOne(process,
    '  let accepted = false;\n  let questionStage',
    '  // null means transport uncertain, never a confirmed rejection.\n  let accepted = null;\n  let questionStage', 'uncertain-default');
  process = replaceOne(process,
    'p_accepted: result2.accepted === true });\n      return { handled: true, accepted: result2.accepted === true, delivered: false };',
    'p_accepted: result2.accepted === true ? true : null });\n      return { handled: true, accepted: result2.accepted === true, delivery_uncertain: result2.accepted !== true, delivered: false };',
    'otp-ack-does-not-close-on-unknown');
  process = replaceOne(process,
    '    accepted = r.ok && typeof data?.messages?.[0]?.id === "string";',
    '    if (r.ok && /^[-A-Za-z0-9._=:/+]{1,200}$/.test(data?.messages?.[0]?.id || "")) accepted = true;\n    else if (r.status >= 400 && r.status < 500 && Number.isInteger(data?.error?.code) && !data?.messages?.length) accepted = false;',
    'explicit-transport-outcome');
  process = replaceOne(process,
    '  return { handled: true, accepted, delivered: false };',
    '  return { handled: true, accepted: accepted === true, delivery_uncertain: accepted === null, delivered: false };',
    'honest-result');
  return source.slice(0, start) + process + source.slice(end);
}


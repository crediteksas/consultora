export const CHANNELS = ['facebook', 'instagram'];
export const HOUR = 3600000;
export class OrganicError extends Error {
  constructor(code, status = 400) { super(code); this.status = status; }
}
export function requireOrganicOwner(auth) {
  if (!auth?.access?.apps?.some(a => a.role_id === 'aura.owner')) throw new OrganicError('OWNER_REQUIRED', 403);
}
export async function digest(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
export async function boundedBytes(request, limit) {
  if (Number(request.headers.get('content-length')) > limit) throw new OrganicError('BODY_TOO_LARGE', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new OrganicError('BODY_REQUIRED');
  let length = 0; const chunks = [];
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.length;
    if (length > limit) { await reader.cancel(); throw new OrganicError('BODY_TOO_LARGE', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
export function jpegDimensions(bytes) {
  if (bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) throw new OrganicError('JPEG_REQUIRED');
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset++] !== 255) break;
    const marker = bytes[offset++];
    if (marker === 218 || marker === 217) break;
    const size = bytes[offset] * 256 + bytes[offset + 1];
    if (size < 2 || offset + size > bytes.length) break;
    if ([192, 193, 194].includes(marker)) {
      const height = bytes[offset + 3] * 256 + bytes[offset + 4];
      const width = bytes[offset + 5] * 256 + bytes[offset + 6];
      if (width < 320 || width > 1440 || height < 320 || width / height < 0.8 || width / height > 1.91) throw new OrganicError('FEED_DIMENSIONS_REQUIRED');
      return { width, height };
    }
    offset += size;
  }
  throw new OrganicError('INVALID_JPEG');
}
export function contentWarnings(text) {
  const warnings = [];
  if (/aprobaci[oó]n garantizada|te aprobamos|creditek te financia|sin revisar historial/i.test(text)) warnings.push('Promesa de crédito no permitida');
  if (/\$\s*\d|\d+\s*%|testimonio|cuotas? desde/i.test(text)) warnings.push('Precio, promoción o testimonio requiere respaldo: usar el flujo comercial verificado');
  if (/cr[eé]dito|financi|payjoy|krediya|alo credit|addi/i.test(text) && !/sujeto a aprobaci[oó]n.*t[eé]rminos y condiciones/is.test(text)) warnings.push('Falta aviso de aprobación y términos');
  return warnings;
}
export function validateCalendar(input, now = Date.now()) {
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(input?.id || '')) throw new OrganicError('INVALID_CALENDAR_ID');
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 100) throw new OrganicError('INVALID_TITLE');
  if (!Array.isArray(input.pieces) || input.pieces.length < 1 || input.pieces.length > 31) throw new OrganicError('CALENDAR_REQUIRES_1_TO_31_PIECES');
  const ids = new Set();
  const pieces = input.pieces.map(p => {
    if (!/^[\w-]{8,64}$/.test(p?.id || '') || ids.has(p.id)) throw new OrganicError('INVALID_PIECE_ID');
    ids.add(p.id);
    if (p.format !== 'image') throw new OrganicError('ONLY_FEED_IMAGES_SUPPORTED');
    if (typeof p.caption !== 'string' || !p.caption.trim() || p.caption.length > 2200) throw new OrganicError('INVALID_CAPTION');
    if (typeof p.topic !== 'string' || !p.topic.trim() || p.topic.length > 80) throw new OrganicError('INVALID_TOPIC');
    if (p.asset && !/^[a-f0-9]{64}\.jpg$/.test(p.asset)) throw new OrganicError('INVALID_ASSET');
    if (!Array.isArray(p.channels) || !p.channels.length || p.channels.some(c => !CHANNELS.includes(c)) || new Set(p.channels).size !== p.channels.length) throw new OrganicError('INVALID_CHANNELS');
    const due = Date.parse(p.scheduled_at);
    if (!Number.isFinite(due) || due < now + 5 * 60000 || due > now + 90 * 24 * HOUR) throw new OrganicError('SCHEDULE_MUST_BE_5_MIN_TO_90_DAYS_AHEAD');
    return { id: p.id, format: 'image', topic: p.topic.trim(), caption: p.caption.trim(), asset: p.asset || null, channels: [...p.channels].sort(), scheduled_at: new Date(due).toISOString(), results: {} };
  });
  return { id: input.id, title: input.title.trim(), pieces };
}
export function approvalPayload(calendar) {
  return JSON.stringify({ id: calendar.id, revision: calendar.revision, title: calendar.title, pieces: calendar.pieces.map(({ results, ...p }) => p) });
}
export function hasStarted(calendar) {
  return calendar.pieces.some(p => Object.values(p.results).some(r => !['scheduled', 'cancelled'].includes(r.status)));
}
export function learnFromCalendars(calendars) {
  // Comparable 24h snapshots only, separately per network. Observational, not causal.
  const channels = {};
  for (const channel of CHANNELS) {
    const samples = [];
    for (const c of calendars) for (const p of c.pieces) {
      const r = p.results[channel];
      const s = r?.snapshots?.find(x => x.age_hours >= 24 && x.age_hours <= 30 && Number.isFinite(x.reach) && x.reach > 0 && Number.isFinite(x.likes));
      if (s) samples.push({ piece_id: p.id, topic: p.topic, hour: new Date(Date.parse(r.published_at) - 5 * HOUR).getUTCHours(), rate: s.likes / s.reach, reach: s.reach });
    }
    const groups = new Map();
    for (const s of samples) { const a = groups.get(s.topic) || []; a.push(s); groups.set(s.topic, a); }
    const eligible = [...groups].filter(([, rows]) => rows.length >= 3).map(([topic, rows]) => ({ topic, n: rows.length, likes_per_reach: rows.reduce((a, r) => a + r.rate, 0) / rows.length, evidence: rows.map(r => r.piece_id) })).sort((a, b) => b.likes_per_reach - a.likes_per_reach);
    channels[channel] = { comparable_posts: samples.length, status: samples.length >= 8 && eligible.length >= 2 ? 'observational_suggestion' : 'insufficient_data', topics: samples.length >= 8 && eligible.length >= 2 ? eligible : [], note: 'Comparación exploratoria a las 24–30 h. No demuestra causalidad ni garantiza alcance. Conserva variedad y requiere aprobación del próximo calendario.' };
  }
  return { channels, leads_attribution: 'unavailable', automatic_changes_to_approved_content: false };
}

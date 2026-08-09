const AURA_URL = 'https://ditiwpndvmyuqcagupea.supabase.co';
const AURA_PUBLIC_KEY = 'sb_publishable_oVNantrnKzXdtXu5B7YQIg_9fxHp7aW';
const KORA_URL = 'https://jfkmiyvcdfbsbwchyvol.supabase.co';
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EVIDENCE = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['application/pdf', 'pdf'],
]);

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function bearer(request) {
  const value = request.headers.get('authorization') || '';
  return /^Bearer\s+[^\s]+$/i.test(value) ? value : '';
}

function serviceHeaders(env, extra = {}) {
  return {
    apikey: env.KORA_SUPABASE_SERVICE_KEY,
    authorization: `Bearer ${env.KORA_SUPABASE_SERVICE_KEY}`,
    ...extra,
  };
}

async function authenticatedAuraUser(request, fetcher) {
  const authorization = bearer(request);
  if (!authorization) return null;
  const headers = { apikey: AURA_PUBLIC_KEY, authorization };
  const [userResponse, accessResponse] = await Promise.all([
    fetcher(`${AURA_URL}/auth/v1/user`, { headers }),
    fetcher(`${AURA_URL}/rest/v1/rpc/aura_my_access`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: '{}',
    }),
  ]);
  if (!userResponse.ok || !accessResponse.ok) return null;
  const [user, access] = await Promise.all([userResponse.json(), accessResponse.json()]);
  if (!user?.email || access?.active === false || !Array.isArray(access?.apps) || !access.apps.length) return null;
  return { email: String(user.email).toLowerCase(), id: String(user.id || '') };
}

function decodeEvidence(input) {
  if (!input) return null;
  const mime = String(input.type || '').toLowerCase();
  const extension = ALLOWED_EVIDENCE.get(mime);
  const encoded = String(input.data || '').replace(/^data:[^;]+;base64,/, '');
  if (!extension || !encoded || !/^[A-Za-z0-9+/=]+$/.test(encoded)) throw new Error('EVIDENCIA_INVALIDA');
  const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
  if (!bytes.length || bytes.length > MAX_EVIDENCE_BYTES) throw new Error('EVIDENCIA_INVALIDA');
  return {
    bytes,
    mime,
    extension,
    name: String(input.name || `evidencia.${extension}`).slice(0, 240),
  };
}

export async function createCorporateIncident(request, env, fetcher = globalThis.fetch) {
  if (request.method !== 'POST') return json({ ok: false, error: 'Método no permitido.' }, 405);
  if (!env?.KORA_SUPABASE_SERVICE_KEY) return json({ ok: false, error: 'El puente con KORA no está configurado.' }, 503);
  const user = await authenticatedAuraUser(request, fetcher);
  if (!user) return json({ ok: false, error: 'La sesión AURA no es válida.' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Solicitud inválida.' }, 400); }
  if (!/^[0-9a-f-]{36}$/i.test(String(body.local_incident_id || ''))) {
    return json({ ok: false, error: 'Identificador de envío inválido.' }, 400);
  }
  let evidence;
  try { evidence = decodeEvidence(body.evidence); }
  catch { return json({ ok: false, error: 'Adjunta una imagen o PDF válido de máximo 10 MB.' }, 400); }

  const payload = {
    title: body.title,
    description: body.description,
    attempted_action: body.expected || 'Reportar incidencia desde AURA',
    additional_information: 'Origen corporativo: AURA',
    priority: body.priority || 'media',
    incident_type: body.incident_type || 'error',
    module: body.module || 'Panel general',
    page_name: body.page_name || body.module || 'AURA',
    page_url: body.page_url,
    kora_version: body.aura_version || 'AURA',
    deployment_version: body.deployment_version,
    browser: body.browser,
    operating_system: body.operating_system,
    screen_resolution: body.screen_resolution,
    viewport: body.viewport,
    connection_status: body.connection_status,
    session_identifier: user.id,
    console_errors: Array.isArray(body.console_errors) ? body.console_errors.slice(-10) : [],
  };
  const incidentResponse = await fetcher(`${KORA_URL}/rest/v1/rpc/kora_create_incident_bridge_v1`, {
    method: 'POST',
    headers: serviceHeaders(env, { 'content-type': 'application/json' }),
    body: JSON.stringify({
      p_payload: payload,
      p_local_incident_id: body.local_incident_id,
      p_aura_email: user.email,
    }),
  });
  const incident = await incidentResponse.json().catch(() => ({}));
  if (!incidentResponse.ok || !incident?.id || !incident?.incident_code) {
    return json({ ok: false, error: 'KORA no pudo registrar la incidencia.' }, 502);
  }

  if (evidence) {
    const path = `${incident.id}/${crypto.randomUUID()}.${evidence.extension}`;
    const upload = await fetcher(`${KORA_URL}/storage/v1/object/kora-incident-evidence/${path}`, {
      method: 'POST',
      headers: serviceHeaders(env, { 'content-type': evidence.mime, 'x-upsert': 'false' }),
      body: evidence.bytes,
    });
    if (!upload.ok) {
      return json({ ok: true, incident_code: incident.incident_code, reused: Boolean(incident.reused), warning: 'La incidencia se registró, pero la evidencia no pudo adjuntarse.' });
    }
    const attach = await fetcher(`${KORA_URL}/rest/v1/rpc/kora_attach_incident_evidence_bridge_v1`, {
      method: 'POST',
      headers: serviceHeaders(env, { 'content-type': 'application/json' }),
      body: JSON.stringify({
        p_incident_id: incident.id,
        p_aura_email: user.email,
        p_path: path,
        p_name: evidence.name,
        p_mime: evidence.mime,
        p_size: evidence.bytes.length,
      }),
    });
    if (!attach.ok) {
      return json({ ok: true, incident_code: incident.incident_code, reused: Boolean(incident.reused), warning: 'La incidencia se registró, pero KORA no pudo asociar la evidencia.' });
    }
  }

  return json({ ok: true, incident_code: incident.incident_code, reused: Boolean(incident.reused) });
}

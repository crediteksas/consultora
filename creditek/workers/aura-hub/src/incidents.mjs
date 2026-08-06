const AURA_URL = 'https://ditiwpndvmyuqcagupea.supabase.co';
const AURA_PUBLIC_KEY = 'sb_publishable_oVNantrnKzXdtXu5B7YQIg_9fxHp7aW';
const KORA_URL = 'https://jfkmiyvcdfbsbwchyvol.supabase.co';
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['application/pdf', 'pdf'],
]);

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function authorization(request) {
  const value = request.headers.get('authorization') || '';
  return /^Bearer\s+[^\s]+$/i.test(value) ? value : '';
}

function serviceHeaders(env, extra = {}) {
  return {
    apikey: env.KORA_SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.KORA_SUPABASE_SERVICE_KEY}`,
    ...extra,
  };
}

async function auraIdentity(request, fetcher) {
  const bearer = authorization(request);
  if (!bearer) return { error: json({ ok: false, error: 'Autenticación AURA requerida.' }, 401) };
  const common = { apikey: AURA_PUBLIC_KEY, Authorization: bearer };
  const [userResponse, accessResponse] = await Promise.all([
    fetcher(`${AURA_URL}/auth/v1/user`, { headers: common }),
    fetcher(`${AURA_URL}/rest/v1/rpc/aura_my_access`, {
      method: 'POST',
      headers: { ...common, 'Content-Type': 'application/json' },
      body: '{}',
    }),
  ]);
  if (!userResponse.ok || !accessResponse.ok) {
    return { error: json({ ok: false, error: 'La sesión AURA no es válida o venció.' }, 401) };
  }
  const user = await userResponse.json().catch(() => ({}));
  const access = await accessResponse.json().catch(() => ({}));
  const permissions = (access.apps || []).flatMap(app => Array.isArray(app?.permissions) ? app.permissions : []);
  const roles = (access.apps || []).map(app => String(app?.role_id || '').toLowerCase());
  const role = String(access.role || access.role_name || access.profile?.role || '').toLowerCase();
  const allowed = access.active !== false && (
    role === 'aura.owner'
    || role === 'owner'
    || roles.includes('aura.owner')
    || permissions.includes('aura.incidents.create')
    || permissions.includes('incidents.create')
  );
  if (!allowed || !user?.email) {
    return { error: json({ ok: false, error: 'No tienes permiso para crear incidencias.' }, 403) };
  }
  return { user, access };
}

async function mappedKoraUser(email, env, fetcher) {
  const response = await fetcher(`${KORA_URL}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: serviceHeaders(env),
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  return (data.users || []).find(user => String(user?.email || '').toLowerCase() === email.toLowerCase()) || null;
}

function decodeEvidence(evidence) {
  if (!evidence) return null;
  const mime = String(evidence.type || '').toLowerCase();
  const extension = ALLOWED_MIME.get(mime);
  const data = String(evidence.data || '').replace(/^data:[^;]+;base64,/, '');
  if (!extension || !data || !/^[A-Za-z0-9+/=]+$/.test(data)) throw new Error('La evidencia no es válida.');
  const bytes = Uint8Array.from(atob(data), character => character.charCodeAt(0));
  if (!bytes.length || bytes.length > MAX_EVIDENCE_BYTES) throw new Error('La evidencia supera el tamaño permitido.');
  return { bytes, mime, extension, name: String(evidence.name || `evidencia.${extension}`).slice(0, 240) };
}

export async function createCorporateIncident(request, env, fetcher = globalThis.fetch) {
  if (request.method !== 'POST') return json({ ok: false, error: 'Solo POST.' }, 405);
  const identity = await auraIdentity(request, fetcher);
  if (identity.error) return identity.error;
  if (!env?.KORA_SUPABASE_SERVICE_KEY) return json({ ok: false, error: 'El puente corporativo no está configurado.' }, 503);
  const koraUser = await mappedKoraUser(identity.user.email, env, fetcher);
  if (!koraUser) {
    return json({ ok: false, error: 'Tu cuenta AURA no tiene un perfil KORA corporativo asociado.' }, 409);
  }

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Solicitud inválida.' }, 400); }
  const localId = String(body.local_incident_id || crypto.randomUUID());
  let evidence;
  try { evidence = decodeEvidence(body.evidence); }
  catch (error) { return json({ ok: false, error: error.message }, 400); }

  const payload = {
    title: body.title,
    description: body.description,
    attempted_action: body.expected,
    additional_information: body.additional_information || 'Origen corporativo: AURA',
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
    session_identifier: body.session_identifier,
    console_errors: Array.isArray(body.console_errors) ? body.console_errors.slice(-10) : [],
  };

  const incidentResponse = await fetcher(`${KORA_URL}/rest/v1/rpc/kora_create_incident_from_aura`, {
    method: 'POST',
    headers: serviceHeaders(env, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p_payload: payload, p_local_incident_id: localId, p_aura_email: identity.user.email }),
  });
  const incident = await incidentResponse.json().catch(() => ({}));
  if (!incidentResponse.ok || !incident?.id || !incident?.incident_code) {
    return json({ ok: false, error: 'KORA no pudo registrar la incidencia.' }, incidentResponse.status === 409 ? 409 : 502);
  }

  if (evidence) {
    const path = `${incident.id}/${crypto.randomUUID()}.${evidence.extension}`;
    const upload = await fetcher(`${KORA_URL}/storage/v1/object/kora-incident-evidence/${path}`, {
      method: 'POST',
      headers: serviceHeaders(env, { 'Content-Type': evidence.mime, 'x-upsert': 'false' }),
      body: evidence.bytes,
    });
    if (!upload.ok) return json({ ok: false, error: 'La incidencia se creó, pero no fue posible adjuntar la evidencia.', incident_code: incident.incident_code }, 502);
    const attach = await fetcher(`${KORA_URL}/rest/v1/rpc/kora_attach_incident_evidence_from_aura`, {
      method: 'POST',
      headers: serviceHeaders(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        p_incident_id: incident.id,
        p_aura_email: identity.user.email,
        p_path: path,
        p_name: evidence.name,
        p_mime: evidence.mime,
        p_size: evidence.bytes.length,
      }),
    });
    if (!attach.ok) return json({ ok: false, error: 'La evidencia fue almacenada, pero KORA no pudo asociarla.', incident_code: incident.incident_code }, 502);
  }

  return json({ ok: true, incident_code: incident.incident_code, reused: Boolean(incident.reused) });
}

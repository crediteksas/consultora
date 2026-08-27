const AURA_SUPABASE_URL = 'https://ditiwpndvmyuqcagupea.supabase.co';
const AURA_SUPABASE_ANON_KEY = 'sb_publishable_oVNantrnKzXdtXu5B7YQIg_9fxHp7aW';
const DEFAULT_CLIENTES_WORKER_URL = 'https://creditek-clientes.comercial-853.workers.dev';
import { AURA_CAPABILITIES, hasAuraCapability } from './aura-access-policy.mjs';

function reply(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function normalizeAccess(value) {
  return Array.isArray(value) ? value[0] || {} : value && typeof value === 'object' ? value : {};
}

async function supabase(path, token, init = {}, fetcher = fetch) {
  return fetcher(`${AURA_SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: AURA_SUPABASE_ANON_KEY,
      authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
}

export async function authenticateAuraCapability(request, capability, fetcher = fetch) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;

  let userResponse;
  let accessResponse;
  try {
    [userResponse, accessResponse] = await Promise.all([
      supabase('/auth/v1/user', token, {}, fetcher),
      supabase('/rest/v1/rpc/aura_my_access', token, { method: 'POST', body: '{}' }, fetcher),
    ]);
  } catch {
    return null;
  }
  if (!userResponse.ok || !accessResponse.ok) return null;
  const user = await userResponse.json().catch(() => ({}));
  const access = normalizeAccess(await accessResponse.json().catch(() => ({})));
  if (
    !user.id ||
    !user.email ||
    access.user_id !== user.id ||
    access.email?.toLowerCase() !== user.email.toLowerCase() ||
    access.active === false
  ) return null;
  if (user.banned_until && Date.parse(user.banned_until) > Date.now()) return null;
  return hasAuraCapability(access, capability) ? { user, access } : null;
}

export async function authenticateAuraOwner(request, fetcher = fetch) {
  return authenticateAuraCapability(request, AURA_CAPABILITIES.GENERAL_LINK, fetcher);
}

function upstreamPath(pathname) {
  if (pathname === '/api/aura/enlaces/origenes') return '/api/admin/origenes-enlaces';
  if (pathname === '/api/aura/enlaces') return '/api/admin/enlaces';
  const revoke = pathname.match(/^\/api\/aura\/enlaces\/([0-9a-f-]+)\/revocar$/i);
  return revoke ? `/api/admin/enlaces/${revoke[1]}/revocar` : '';
}

export async function handleAuraEnlacesProxy(request, env, fetcher = fetch) {
  if (!await authenticateAuraOwner(request, fetcher)) {
    return reply({ ok: false, error: 'No autorizado' }, 403);
  }
  if (!env.ADMIN_ENLACES_TOKEN) return reply({ ok: false, error: 'Servicio no configurado' }, 503);

  const path = upstreamPath(new URL(request.url).pathname);
  if (!path) return reply({ ok: false, error: 'Ruta no encontrada' }, 404);
  const allowedMethod = (path === '/api/admin/origenes-enlaces' && request.method === 'GET') ||
    (path !== '/api/admin/origenes-enlaces' && request.method === 'POST');
  if (!allowedMethod) return reply({ ok: false, error: 'Método no permitido' }, 405);

  let body;
  if (request.method === 'POST') {
    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > 4_096) return reply({ ok: false, error: 'Solicitud demasiado grande' }, 413);
    body = await request.text();
    if (body.length > 4_096) return reply({ ok: false, error: 'Solicitud demasiado grande' }, 413);
  }

  const upstream = `${String(env.CLIENTES_WORKER_URL || DEFAULT_CLIENTES_WORKER_URL).replace(/\/$/, '')}${path}`;
  try {
    const response = await fetcher(upstream, {
      method: request.method,
      headers: {
        authorization: `Bearer ${env.ADMIN_ENLACES_TOKEN}`,
        accept: 'application/json',
        ...(request.method === 'POST' ? { 'content-type': 'application/json' } : {}),
      },
      ...(request.method === 'POST' ? { body: body || '{}' } : {}),
    });
    const headers = new Headers(response.headers);
    headers.set('cache-control', 'no-store');
    headers.delete('set-cookie');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch {
    return reply({ ok: false, error: 'Servicio de enlaces no disponible' }, 503);
  }
}

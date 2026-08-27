const APP_ID = 'sofia';

function bearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return '';
  return header.slice(7).trim();
}

function normalizeObject(value) {
  return Array.isArray(value) ? value[0] || {} : value && typeof value === 'object' ? value : {};
}

async function supabaseRequest(env, path, token, fetcher, body) {
  const baseUrl = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = env.AURA_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) return null;
  return fetcher(`${baseUrl}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export async function authorizeSofiaCampaign(request, env, permission, fetcher = fetch) {
  const token = bearerToken(request);
  if (!token) return { ok: false, status: 401, code: 'unauthorized' };

  let userResponse;
  let accessResponse;
  try {
    [userResponse, accessResponse] = await Promise.all([
      supabaseRequest(env, '/auth/v1/user', token, fetcher),
      supabaseRequest(env, '/rest/v1/rpc/aura_my_access', token, fetcher, {}),
    ]);
  } catch {
    return { ok: false, status: 503, code: 'auth_unavailable' };
  }

  if (!userResponse || !accessResponse) return { ok: false, status: 503, code: 'auth_not_configured' };
  if (!userResponse.ok || !accessResponse.ok) return { ok: false, status: 401, code: 'unauthorized' };

  const user = normalizeObject(await userResponse.json().catch(() => ({})));
  const access = normalizeObject(await accessResponse.json().catch(() => ({})));
  if (!user.id || access.user_id !== user.id || access.active === false) {
    return { ok: false, status: 401, code: 'unauthorized' };
  }

  const apps = Array.isArray(access.apps) ? access.apps : [];
  const owner = apps.some((app) => app?.role_id === 'aura.owner');
  const sofia = apps.find((app) => app?.app_id === APP_ID);
  const permissions = Array.isArray(sofia?.permissions) ? sofia.permissions : [];
  if (!owner && !permissions.includes(permission)) {
    return { ok: false, status: 403, code: 'forbidden' };
  }

  return { ok: true, status: 200, userId: user.id, roleId: owner ? 'aura.owner' : sofia.role_id };
}


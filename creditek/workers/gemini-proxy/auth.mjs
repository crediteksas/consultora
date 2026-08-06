const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function decodePart(part) {
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(normalized), character => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function inspectBearer(authorization, now = Math.floor(Date.now() / 1000)) {
  const token = typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : '';
  const result = {
    token_present: Boolean(token),
    token_format_valid: false,
    iss: null,
    aud: null,
    sub_present: false,
    sub: null,
    exp: null,
    expired: false,
  };
  if (!JWT_RE.test(token)) return result;
  try {
    const payload = decodePart(token.split('.')[1]);
    result.token_format_valid = true;
    result.iss = typeof payload.iss === 'string' ? payload.iss : null;
    result.aud = typeof payload.aud === 'string'
      ? payload.aud
      : Array.isArray(payload.aud) ? payload.aud.join(',') : null;
    result.sub_present = typeof payload.sub === 'string' && payload.sub.length > 0;
    result.sub = result.sub_present ? payload.sub : null;
    result.exp = Number.isFinite(payload.exp) ? payload.exp : null;
    result.expired = result.exp !== null && result.exp <= now;
  } catch {
    result.token_format_valid = false;
  }
  return result;
}

function publicDiagnostics(info, cause) {
  return {
    token_present: info.token_present,
    token_format_valid: info.token_format_valid,
    iss: info.iss,
    aud: info.aud,
    sub_present: info.sub_present,
    exp: info.exp,
    cause,
  };
}

function normalizeAccess(value) {
  return Array.isArray(value) ? value[0] || {} : value && typeof value === 'object' ? value : {};
}

export async function authenticateAura(request, env, fetcher = fetch, logger = console) {
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const info = inspectBearer(authorization);
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = env.AURA_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  const expectedIssuer = env.SUPABASE_JWT_ISSUER || `${supabaseUrl}/auth/v1`;
  let cause = 'ok';

  if (!info.token_present) cause = 'missing_bearer_token';
  else if (!info.token_format_valid) cause = 'malformed_jwt';
  else if (!supabaseUrl || !anonKey) cause = 'supabase_configuration_missing';
  else if (info.iss !== expectedIssuer) cause = 'issuer_mismatch';
  else if (info.aud !== (env.SUPABASE_JWT_AUDIENCE || 'authenticated')) cause = 'audience_mismatch';
  else if (!info.sub_present) cause = 'subject_missing';
  else if (info.exp === null) cause = 'expiration_missing';
  else if (info.expired) cause = 'token_expired';

  if (cause === 'ok') {
    const headers = { apikey: anonKey, Authorization: `Bearer ${token}` };
    let userResponse;
    try {
      userResponse = await fetcher(`${supabaseUrl}/auth/v1/user`, { headers });
    } catch {
      cause = 'supabase_auth_unreachable';
    }
    if (cause === 'ok' && !userResponse.ok) cause = `supabase_auth_http_${userResponse.status}`;
    if (cause === 'ok') {
      const user = await userResponse.json().catch(() => ({}));
      if (user.id !== info.sub) cause = 'subject_mismatch';
      if (cause === 'ok') {
        let accessResponse;
        try {
          accessResponse = await fetcher(`${supabaseUrl}/rest/v1/rpc/aura_my_access`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: '{}',
          });
        } catch {
          cause = 'supabase_access_unreachable';
        }
        if (cause === 'ok' && !accessResponse.ok) cause = `supabase_access_http_${accessResponse.status}`;
        if (cause === 'ok') {
          const access = normalizeAccess(await accessResponse.json().catch(() => ({})));
          if (access.user_id !== info.sub || access.active === false || !Array.isArray(access.apps) || access.apps.length === 0) {
            cause = 'aura_access_denied';
          }
        }
      }
    }
  }

  if (env.AUTH_DIAGNOSTICS === 'true') {
    logger.log('[AURA-AUTH]', JSON.stringify(publicDiagnostics(info, cause)));
  }
  return cause === 'ok';
}

export const AURA_AUTH = Object.freeze({
  url: 'https://ditiwpndvmyuqcagupea.supabase.co',
  key: 'sb_publishable_oVNantrnKzXdtXu5B7YQIg_9fxHp7aW',
  storage: 'aura_supabase_session_v1',
});

const STORAGE_KEY = AURA_AUTH.storage;
const ALLOWED_RETURN_PREFIXES = ['/creditek/agentes/', '/creditek/portal/'];

export function sanitizeReturnTo(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '';
  try {
    const parsed = new URL(value, 'https://registro.crediteksas.com');
    if (parsed.origin !== 'https://registro.crediteksas.com') return '';
    return ALLOWED_RETURN_PREFIXES.some(prefix => parsed.pathname.startsWith(prefix))
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : '';
  } catch {
    return '';
  }
}

export function loginUrlFor(returnTo = '') {
  const safe = sanitizeReturnTo(returnTo);
  return `/creditek/agentes/${safe ? `?return_to=${encodeURIComponent(safe)}` : ''}`;
}

export function appGrant(access, appId) {
  return Array.isArray(access?.apps)
    ? access.apps.find(candidate => candidate?.app_id === appId) || null
    : null;
}

export function hasPermission(access, appId, permission) {
  const grant = appGrant(access, appId);
  return Array.isArray(grant?.permissions) && grant.permissions.includes(permission);
}

export function portalDecision({ session, access }) {
  if (!session) return 'redirect';
  return hasPermission(access, 'portal_b2b', 'portal.read') ? 'allow' : 'deny';
}

function parseSession(storage) {
  try {
    const session = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
    return session?.access_token && session?.refresh_token && Number(session?.expires_at) ? session : null;
  } catch {
    storage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function createAuraAuthClient({
  fetchImpl = globalThis.fetch,
  storage = globalThis.localStorage,
  now = () => Date.now(),
} = {}) {
  if (!storage) throw new Error('Almacenamiento de sesión no disponible');
  let session = parseSession(storage);
  let access = null;

  async function authFetch(path, options = {}) {
    return fetchImpl(`${AURA_AUTH.url}${path}`, {
      ...options,
      headers: {
        apikey: AURA_AUTH.key,
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
    });
  }

  function save(next) {
    session = {
      access_token: next.access_token,
      refresh_token: next.refresh_token,
      expires_at: Number(next.expires_at) || Math.floor(now() / 1000) + Number(next.expires_in || 3600),
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(session));
    return session;
  }

  function clear() {
    session = null;
    access = null;
    storage.removeItem(STORAGE_KEY);
  }

  async function refresh() {
    if (!session?.refresh_token) return false;
    const response = await authFetch('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!response.ok) {
      clear();
      return false;
    }
    save(await response.json());
    return true;
  }

  async function token() {
    if (!session) return '';
    if (session.expires_at <= Math.floor(now() / 1000) + 60 && !await refresh()) return '';
    return session.access_token;
  }

  async function loadAccess() {
    const bearer = await token();
    if (!bearer) return null;
    const response = await fetchImpl(`${AURA_AUTH.url}/rest/v1/rpc/aura_my_access`, {
      method: 'POST',
      headers: {
        apikey: AURA_AUTH.key,
        authorization: `Bearer ${bearer}`,
        'content-type': 'application/json',
      },
      body: '{}',
    });
    if (!response.ok) {
      if (response.status === 401) clear();
      return null;
    }
    access = await response.json();
    return access;
  }

  async function signOut() {
    const bearer = session?.access_token;
    if (bearer) {
      await authFetch('/auth/v1/logout', {
        method: 'POST',
        headers: { authorization: `Bearer ${bearer}` },
        body: '{}',
      }).catch(() => {});
    }
    clear();
  }

  return Object.freeze({
    async signIn(email, password) {
      const response = await authFetch('/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: JSON.stringify({ email: String(email || '').trim().toLowerCase(), password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error('Correo o contraseña incorrectos');
      save(data);
      const profile = await loadAccess();
      if (!profile || !Array.isArray(profile.apps) || profile.apps.length === 0) {
        await signOut();
        throw new Error('Tu usuario no tiene módulos autorizados en AURA');
      }
      return profile;
    },
    async restore() {
      session = parseSession(storage);
      if (!session) return null;
      const profile = await loadAccess();
      if (!profile) clear();
      return profile;
    },
    signOut,
    token,
    session: () => session,
    access: () => access,
    clear,
  });
}

export const auraAuth = typeof window === 'undefined' ? null : createAuraAuthClient();

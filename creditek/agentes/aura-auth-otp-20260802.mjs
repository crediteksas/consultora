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
  transientStorage = globalThis.sessionStorage,
  now = () => Date.now(),
} = {}) {
  if (!storage) throw new Error('Almacenamiento de sesión no disponible');
  let rememberSession = true;
  let session = parseSession(storage) || (transientStorage ? parseSession(transientStorage) : null);
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
    const destination = rememberSession || !transientStorage ? storage : transientStorage;
    const alternate = destination === storage ? transientStorage : storage;
    alternate?.removeItem(STORAGE_KEY);
    destination.setItem(STORAGE_KEY, JSON.stringify(session));
    return session;
  }

  function clear() {
    session = null;
    access = null;
    storage.removeItem(STORAGE_KEY);
    transientStorage?.removeItem(STORAGE_KEY);
  }

  async function requestPasswordRecovery(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) throw new Error('Escribe un correo electrónico válido');
    const response = await authFetch('/auth/v1/recover', {
      method: 'POST',
      body: JSON.stringify({ email: normalized }),
    });
    if (!response.ok && response.status === 429) {
      throw new Error('Hay demasiadas solicitudes. Espera unos minutos e inténtalo nuevamente.');
    }
    if (!response.ok) {
      throw new Error('No fue posible enviar el código. Inténtalo nuevamente.');
    }
    return {
      message: 'Si el correo está registrado, recibirás un código de seis dígitos.',
    };
  }

  async function verifyRecoveryCode(email, code) {
    const normalized = String(email || '').trim().toLowerCase();
    const tokenValue = String(code || '').trim();
    if (!normalized || !normalized.includes('@')) throw new Error('Escribe un correo electrónico válido');
    if (!/^\d{6}$/.test(tokenValue)) throw new Error('El código debe tener seis dígitos');
    const response = await authFetch('/auth/v1/verify', {
      method: 'POST',
      body: JSON.stringify({ email: normalized, token: tokenValue, type: 'recovery' }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token || !data.refresh_token) {
      if (data?.error_code === 'otp_expired') {
        throw new Error('El código venció o ya fue utilizado. Solicita uno nuevo.');
      }
      throw new Error('El código es inválido. Verifícalo e inténtalo nuevamente.');
    }
    save(data);
    return { verified: true };
  }

  async function updatePassword(password) {
    if (String(password || '').length < 10) {
      throw new Error('La contraseña debe tener al menos 10 caracteres');
    }
    const bearer = await token();
    if (!bearer) throw new Error('La sesión de recuperación venció. Solicita un enlace nuevo.');
    const response = await authFetch('/auth/v1/user', {
      method: 'PUT',
      headers: { authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (response.status === 422 && /same|different/i.test(data?.message || '')) {
        throw new Error('La nueva contraseña debe ser diferente de la anterior');
      }
      throw new Error('No pudimos actualizar la contraseña. Solicita un enlace nuevo.');
    }
    const profile = await loadAccess();
    if (!profile) throw new Error('La contraseña se actualizó, pero la sesión debe iniciarse nuevamente.');
    return profile;
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
    const options = {
      method: 'POST',
      headers: {
        apikey: AURA_AUTH.key,
        authorization: `Bearer ${bearer}`,
        'content-type': 'application/json',
      },
      body: '{}',
    };
    const [response, metaResponse] = await Promise.all([
      fetchImpl(`${AURA_AUTH.url}/rest/v1/rpc/aura_my_access`, options),
      fetchImpl(`${AURA_AUTH.url}/rest/v1/rpc/aura_meta_ads_my_access`, options).catch(() => null),
    ]);
    if (!response.ok) {
      if (response.status === 401) clear();
      return null;
    }
    access = await response.json();
    if (metaResponse?.ok) {
      const metaGrant = await metaResponse.json().catch(() => null);
      if (metaGrant?.active && Array.isArray(metaGrant.permissions)) {
        access.apps = [...(Array.isArray(access.apps) ? access.apps : []), metaGrant];
      }
    }
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
      session = parseSession(storage) || (transientStorage ? parseSession(transientStorage) : null);
      if (!session) return null;
      const profile = await loadAccess();
      if (!profile) clear();
      return profile;
    },
    requestPasswordRecovery,
    verifyRecoveryCode,
    updatePassword,
    setRememberSession(value) {
      rememberSession = Boolean(value);
    },
    signOut,
    token,
    session: () => session,
    access: () => access,
    clear,
  });
}

export const auraAuth = typeof window === 'undefined' ? null : createAuraAuthClient();

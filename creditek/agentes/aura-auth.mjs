export const AURA_AUTH = Object.freeze({
  url: 'https://ditiwpndvmyuqcagupea.supabase.co',
  key: 'sb_publishable_oVNantrnKzXdtXu5B7YQIg_9fxHp7aW',
  storage: 'aura_supabase_session_v1',
});

export const AURA_RECOVERY_REDIRECT = 'https://registro.crediteksas.com/creditek/agentes/';

const STORAGE_KEY = AURA_AUTH.storage;
const PKCE_VERIFIER_KEY = `${STORAGE_KEY}-code-verifier`;
const AUTH_FLOW_TYPE_KEY = `${STORAGE_KEY}-flow-type`;
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

function callbackType(params) {
  const type = params.get('type');
  return type === 'invite' || type === 'recovery' ? type : '';
}

function cleanCallbackUrl(rawUrl) {
  const url = new URL(rawUrl, AURA_RECOVERY_REDIRECT);
  const safe = new URLSearchParams();
  const returnTo = sanitizeReturnTo(url.searchParams.get('return_to') || '');
  if (returnTo) safe.set('return_to', returnTo);
  const query = safe.toString();
  return `${url.pathname}${query ? `?${query}` : ''}`;
}

function base64Url(bytes) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    result += alphabet[a >> 2];
    result += alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b !== undefined) result += alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c !== undefined) result += alphabet[c & 63];
  }
  return result;
}

export function createAuraAuthClient({
  fetchImpl = globalThis.fetch,
  storage = globalThis.localStorage,
  transientStorage = globalThis.sessionStorage,
  cryptoImpl = globalThis.crypto,
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
    storage.removeItem(PKCE_VERIFIER_KEY);
    storage.removeItem(AUTH_FLOW_TYPE_KEY);
    transientStorage?.removeItem(PKCE_VERIFIER_KEY);
    transientStorage?.removeItem(AUTH_FLOW_TYPE_KEY);
  }

  async function requestPasswordRecovery(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) throw new Error('Escribe un correo electrónico válido');
    if (!cryptoImpl?.subtle || !cryptoImpl?.getRandomValues) {
      throw new Error('Este navegador no permite iniciar una recuperación segura. Actualízalo e inténtalo nuevamente.');
    }
    const random = cryptoImpl.getRandomValues(new Uint8Array(48));
    const verifier = base64Url(random);
    const digest = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = base64Url(new Uint8Array(digest));
    storage.setItem(PKCE_VERIFIER_KEY, verifier);
    storage.setItem(AUTH_FLOW_TYPE_KEY, 'recovery');
    const response = await authFetch(`/auth/v1/recover?redirect_to=${encodeURIComponent(AURA_RECOVERY_REDIRECT)}`, {
      method: 'POST',
      body: JSON.stringify({
        email: normalized,
        code_challenge: challenge,
        code_challenge_method: 's256',
      }),
    });
    if (!response.ok && response.status === 429) {
      throw new Error('Hay demasiadas solicitudes. Espera unos minutos e inténtalo nuevamente.');
    }
    return {
      message: 'Si el correo está registrado, recibirás un enlace para crear una nueva contraseña.',
    };
  }

  async function consumeAuthCallback(rawUrl, replaceUrl = () => {}) {
    const url = new URL(rawUrl, AURA_RECOVERY_REDIRECT);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    const query = url.searchParams;
    const type = callbackType(hash.has('type') ? hash : query)
      || callbackType(new URLSearchParams({ type: storage.getItem(AUTH_FLOW_TYPE_KEY) || '' }));
    const hasCallback = hash.has('access_token') || query.has('code') || hash.has('error') || query.has('error');
    if (!hasCallback) return { mode: 'none', type: '' };

    replaceUrl(cleanCallbackUrl(url.href));
    if (hash.get('error') || query.get('error')) {
      clear();
      return {
        mode: 'callback-error',
        message: 'Este enlace es inválido o venció. Solicita uno nuevo para continuar.',
      };
    }

    if (!type) {
      clear();
      return {
        mode: 'callback-error',
        message: 'Este enlace no corresponde a una invitación o recuperación válida de AURA.',
      };
    }

    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    if (accessToken && refreshToken) {
      save({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: Number(hash.get('expires_in') || 3600),
        expires_at: Number(hash.get('expires_at') || 0),
      });
      return { mode: 'set-password', type };
    }

    const code = query.get('code');
    const verifier = storage.getItem(PKCE_VERIFIER_KEY);
    if (!code || !verifier) {
      clear();
      return {
        mode: 'callback-error',
        message: 'Este enlace es inválido o venció. Solicita uno nuevo para continuar.',
      };
    }

    const response = await authFetch('/auth/v1/token?grant_type=pkce', {
      method: 'POST',
      body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    });
    storage.removeItem(PKCE_VERIFIER_KEY);
    storage.removeItem(AUTH_FLOW_TYPE_KEY);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token || !data.refresh_token) {
      clear();
      return {
        mode: 'callback-error',
        message: 'Este enlace venció, ya fue utilizado o es inválido. Solicita uno nuevo.',
      };
    }
    save(data);
    return { mode: 'set-password', type };
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
      session = parseSession(storage) || (transientStorage ? parseSession(transientStorage) : null);
      if (!session) return null;
      const profile = await loadAccess();
      if (!profile) clear();
      return profile;
    },
    requestPasswordRecovery,
    consumeAuthCallback,
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

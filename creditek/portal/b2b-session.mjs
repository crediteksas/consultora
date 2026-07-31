const STORAGE_KEY = 'aura_b2b_session';
const CLIENT_KEY = 'aura_b2b_client_id';

function parseStoredSession(storage) {
  try {
    return JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
  } catch {
    storage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function createB2BSessionClient({
  endpoint,
  fetchImpl = globalThis.fetch,
  storage = globalThis.sessionStorage,
  now = () => Date.now(),
} = {}) {
  if (!endpoint) throw new Error('El servicio B2B no está configurado');
  let session = parseStoredSession(storage);

  function clientId() {
    let value = storage.getItem(CLIENT_KEY);
    if (!value) {
      value = globalThis.crypto?.randomUUID?.() || `client-${now()}-${Math.random()}`;
      storage.setItem(CLIENT_KEY, value);
    }
    return value;
  }

  async function post(payload) {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok !== true) {
      throw new Error(data.error || 'Acceso denegado');
    }
    return data;
  }

  function clear() {
    session = null;
    storage.removeItem(STORAGE_KEY);
  }

  return Object.freeze({
    async login(password, { requireAdmin = false } = {}) {
      if (!String(password || '').trim()) throw new Error('La clave es obligatoria');
      const data = await post({
        action: 'autenticar_portal_b2b',
        password,
        client_id: clientId(),
        require_admin: requireAdmin,
      });
      if (!data.session_token || !Number(data.expires_at)) {
        throw new Error('El servicio de acceso no está configurado');
      }
      if (requireAdmin && data.scope !== 'admin') {
        throw new Error('Acceso administrativo denegado');
      }
      session = {
        token: data.session_token,
        expiresAt: Number(data.expires_at),
        scope: data.scope === 'admin' ? 'admin' : 'access',
      };
      storage.setItem(STORAGE_KEY, JSON.stringify(session));
      return true;
    },

    async restoreSession({ requireAdmin = false } = {}) {
      session = parseStoredSession(storage);
      if (!session?.token || !session.expiresAt || session.expiresAt <= now()) {
        clear();
        return false;
      }
      if (requireAdmin && session.scope !== 'admin') return false;
      try {
        const data = await post({
          action: 'validar_sesion_portal_b2b',
          session_token: session.token,
          required_scope: requireAdmin ? 'admin' : 'access',
        });
        if (data.valid !== true || !Number(data.expires_at)) {
          clear();
          return false;
        }
        session.expiresAt = Number(data.expires_at);
        storage.setItem(STORAGE_KEY, JSON.stringify(session));
        return true;
      } catch {
        clear();
        return false;
      }
    },

    token({ requireAdmin = false } = {}) {
      if (!session?.token || session.expiresAt <= now()) {
        clear();
        return '';
      }
      if (requireAdmin && session.scope !== 'admin') return '';
      return session.token;
    },

    scope() {
      return session?.scope || null;
    },

    logout: clear,
  });
}

if (typeof window !== 'undefined') {
  const b2bSession = createB2BSessionClient({
    endpoint: window.__AURA_B2B_APPS_SCRIPT_URL__,
  });
  window.B2BAccessSession = b2bSession;
  window.B2BAccessReady = b2bSession.restoreSession().then(valid => {
    if (valid) document.getElementById('b2bLoginOverlay')?.style.setProperty('display', 'none');
    return b2bSession;
  });
}

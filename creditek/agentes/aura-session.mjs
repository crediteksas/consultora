const readSession = storage => {
  try {
    return JSON.parse(storage.getItem('ck_supa_session') || 'null');
  } catch {
    return null;
  }
};

const jwtExpiry = token => {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return Number(JSON.parse(atob(payload)).exp) || 0;
  } catch {
    return 0;
  }
};

export const isSessionUsable = (session, now = Date.now()) => {
  if (!session?.access_token) return false;
  const expiresAt = Number(session.expires_at) || jwtExpiry(session.access_token);
  return !expiresAt || expiresAt * 1000 > now + 30_000;
};

export const ensureAuraSession = async ({
  storage = sessionStorage,
  fetchImpl = fetch,
  endpoint,
  gate,
  now = Date.now(),
}) => {
  const current = readSession(storage);
  if (isSessionUsable(current, now)) return { ok: true, session: current, renewed: false };
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gate }),
    });
    if (!response?.ok) return { ok: false, error: 'No fue posible renovar la sesión de Sofía.' };
    const data = await response.json();
    if (!isSessionUsable(data, now)) return { ok: false, error: 'La sesión recibida no es válida.' };
    const session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      email: data.email,
    };
    storage.setItem('ck_supa_session', JSON.stringify(session));
    return { ok: true, session, renewed: true };
  } catch {
    return { ok: false, error: 'No fue posible conectar con el servicio de sesión.' };
  }
};

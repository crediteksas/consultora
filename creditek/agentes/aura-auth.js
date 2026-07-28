(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CreditekAuraAuth = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const SESSION_KEY = 'aura_supa_session';

  function createAuraAuth({
    supabaseUrl,
    publishableKey,
    fetchFn = fetch,
    sessionStorage,
  }) {
    if (!supabaseUrl || !publishableKey || !sessionStorage) {
      throw new Error('Configuración de autenticación AURA incompleta.');
    }

    function isAuthorized(user) {
      return user?.app_metadata?.aura_access === true;
    }

    async function signIn(email, password) {
      const normalizedEmail = String(email || '').trim();
      if (!normalizedEmail || !password) {
        return {
          ok: false,
          code: 'required',
          message: 'Ingresa correo y contraseña.',
        };
      }

      const response = await fetchFn(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          apikey: publishableKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
        }),
      });

      if (!response.ok) {
        return {
          ok: false,
          code: 'invalid',
          message: 'No pudimos iniciar sesión con esos datos.',
        };
      }

      const session = await response.json();
      if (!isAuthorized(session.user)) {
        sessionStorage.removeItem(SESSION_KEY);
        return {
          ok: false,
          code: 'forbidden',
          message: 'Tu cuenta no tiene acceso a AURA.',
        };
      }

      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return { ok: true, session };
    }

    async function restoreSession() {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;

      try {
        const session = JSON.parse(raw);
        const expired = !session.expires_at || session.expires_at * 1000 <= Date.now();
        if (expired || !isAuthorized(session.user)) {
          sessionStorage.removeItem(SESSION_KEY);
          return null;
        }
        return session;
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
    }

    function signOut() {
      sessionStorage.removeItem(SESSION_KEY);
    }

    return {
      signIn,
      restoreSession,
      signOut,
      isAuthorized,
    };
  }

  return {
    createAuraAuth,
  };
});

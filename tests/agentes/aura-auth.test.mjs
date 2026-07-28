import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../..');
const { createAuraAuth } = require(path.join(root, 'creditek/agentes/aura-auth.js'));

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

const nowSeconds = Math.floor(Date.now() / 1000);
const authorizedSession = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_at: nowSeconds + 3600,
  user: {
    id: 'oscar-user',
    email: 'oscar@creditek.test',
    app_metadata: { aura_access: true },
  },
};

test('signIn envía correo y contraseña a Supabase Auth y guarda solo la sesión retornada', async () => {
  const storage = memoryStorage();
  const calls = [];
  const auth = createAuraAuth({
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'publishable-test-key',
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(200, authorizedSession);
    },
    sessionStorage: storage,
  });

  const result = await auth.signIn(' oscar@creditek.test ', 'secreta');

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.supabase.co/auth/v1/token?grant_type=password');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    email: 'oscar@creditek.test',
    password: 'secreta',
  });
  assert.equal(storage.getItem('aura_supa_session'), JSON.stringify(authorizedSession));
  assert.equal(storage.getItem('password'), null);
});

test('signIn rechaza una cuenta autenticada sin aura_access', async () => {
  const storage = memoryStorage();
  const auth = createAuraAuth({
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'publishable-test-key',
    fetchFn: async () => jsonResponse(200, {
      ...authorizedSession,
      user: {
        id: 'other-user',
        email: 'otro@creditek.test',
        app_metadata: {},
      },
    }),
    sessionStorage: storage,
  });

  assert.deepEqual(await auth.signIn('otro@creditek.test', 'secreta'), {
    ok: false,
    code: 'forbidden',
    message: 'Tu cuenta no tiene acceso a AURA.',
  });
  assert.equal(storage.getItem('aura_supa_session'), null);
});

test('signIn valida campos obligatorios sin transmitir credenciales', async () => {
  let transmitted = false;
  const auth = createAuraAuth({
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'publishable-test-key',
    fetchFn: async () => {
      transmitted = true;
      return jsonResponse(500, {});
    },
    sessionStorage: memoryStorage(),
  });

  assert.deepEqual(await auth.signIn('', ''), {
    ok: false,
    code: 'required',
    message: 'Ingresa correo y contraseña.',
  });
  assert.equal(transmitted, false);
});

test('restoreSession descarta sesiones vencidas o no autorizadas', async () => {
  const expiredStorage = memoryStorage({
    aura_supa_session: JSON.stringify({
      ...authorizedSession,
      expires_at: nowSeconds - 60,
    }),
  });
  const expiredAuth = createAuraAuth({
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'publishable-test-key',
    fetchFn: async () => jsonResponse(500, {}),
    sessionStorage: expiredStorage,
  });

  assert.equal(await expiredAuth.restoreSession(), null);
  assert.equal(expiredStorage.getItem('aura_supa_session'), null);

  const unauthorizedStorage = memoryStorage({
    aura_supa_session: JSON.stringify({
      ...authorizedSession,
      user: { ...authorizedSession.user, app_metadata: {} },
    }),
  });
  const unauthorizedAuth = createAuraAuth({
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'publishable-test-key',
    fetchFn: async () => jsonResponse(500, {}),
    sessionStorage: unauthorizedStorage,
  });

  assert.equal(await unauthorizedAuth.restoreSession(), null);
  assert.equal(unauthorizedStorage.getItem('aura_supa_session'), null);
});

test('signOut elimina solo la sesión de AURA', () => {
  const storage = memoryStorage({
    aura_supa_session: JSON.stringify(authorizedSession),
    unrelated: 'keep',
  });
  const auth = createAuraAuth({
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'publishable-test-key',
    fetchFn: async () => jsonResponse(500, {}),
    sessionStorage: storage,
  });

  auth.signOut();

  assert.equal(storage.getItem('aura_supa_session'), null);
  assert.equal(storage.getItem('unrelated'), 'keep');
});

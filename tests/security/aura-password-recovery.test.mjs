import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => readFile(path.join(root, relative), 'utf8');

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('solicita recuperación dentro del dominio AURA sin revelar si el correo existe', async () => {
  const { createAuraAuthClient, AURA_RECOVERY_REDIRECT } = await import('../../creditek/agentes/aura-auth.mjs');
  const calls = [];
  const storage = memoryStorage();
  const client = createAuraAuthClient({
    storage,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({});
    },
  });

  const result = await client.requestPasswordRecovery('Comercial@CreditekSAS.com');
  assert.equal(result.message, 'Si el correo está registrado, recibirás un enlace para crear una nueva contraseña.');
  assert.match(calls[0].url, /\/auth\/v1\/recover\?redirect_to=/);
  assert.equal(new URL(calls[0].url).searchParams.get('redirect_to'), AURA_RECOVERY_REDIRECT);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.email, 'comercial@crediteksas.com');
  assert.equal(body.code_challenge_method, 's256');
  assert.match(body.code_challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.match(storage.getItem('aura_supabase_session_v1-code-verifier'), /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(storage.getItem('aura_supabase_session_v1-flow-type'), 'recovery');
});

test('un reintento rechazado con 429 conserva el verificador de la primera recuperación', async () => {
  const { createAuraAuthClient, AURA_AUTH } = await import('../../creditek/agentes/aura-auth.mjs');
  const verifierKey = `${AURA_AUTH.storage}-code-verifier`;
  const storage = memoryStorage();
  let recoveries = 0;
  const exchanges = [];
  const client = createAuraAuthClient({
    storage,
    fetchImpl: async (url, options) => {
      if (url.includes('/auth/v1/recover')) {
        recoveries += 1;
        return recoveries === 1 ? jsonResponse({}) : jsonResponse({}, 429);
      }
      exchanges.push(JSON.parse(options.body));
      return jsonResponse({ access_token: 'pkce-access', refresh_token: 'pkce-refresh', expires_in: 3600 });
    },
  });

  await client.requestPasswordRecovery('comercial@crediteksas.com');
  const verifierA = storage.getItem(verifierKey);
  await assert.rejects(
    client.requestPasswordRecovery('comercial@crediteksas.com'),
    /demasiadas solicitudes/i,
  );
  assert.equal(storage.getItem(verifierKey), verifierA);

  const result = await client.consumeAuthCallback(
    'https://registro.crediteksas.com/creditek/agentes/?code=code-from-first-email',
  );
  assert.deepEqual(result, { mode: 'set-password', type: 'recovery' });
  assert.equal(exchanges[0].code_verifier, verifierA);
});

test('procesa recovery e invite implícitos, guarda sesión y limpia tokens de la URL', async () => {
  const { createAuraAuthClient } = await import('../../creditek/agentes/aura-auth.mjs');
  for (const type of ['recovery', 'invite']) {
    const storage = memoryStorage();
    let cleaned = '';
    const client = createAuraAuthClient({ storage, fetchImpl: async () => jsonResponse({}) });
    const result = await client.consumeAuthCallback(
      `https://registro.crediteksas.com/creditek/agentes/?return_to=%2Fcreditek%2Fportal%2F#access_token=secret-access&refresh_token=secret-refresh&expires_in=3600&type=${type}`,
      value => { cleaned = value; },
    );
    assert.deepEqual(result, { mode: 'set-password', type });
    assert.equal(client.session().access_token, 'secret-access');
    assert.equal(cleaned, '/creditek/agentes/?return_to=%2Fcreditek%2Fportal%2F');
    assert.doesNotMatch(cleaned, /token|secret|type=/);
  }
});

test('intercambia un código PKCE una sola vez cuando existe verificador', async () => {
  const { createAuraAuthClient, AURA_AUTH } = await import('../../creditek/agentes/aura-auth.mjs');
  const verifierKey = `${AURA_AUTH.storage}-code-verifier`;
  const storage = memoryStorage({
    [verifierKey]: 'v'.repeat(64),
    [`${AURA_AUTH.storage}-flow-type`]: 'recovery',
  });
  const calls = [];
  const client = createAuraAuthClient({
    storage,
    fetchImpl: async (url, options) => {
      assert.equal(cleaned, '', 'la URL no debe limpiarse antes de confirmar el intercambio');
      calls.push({ url, options });
      return jsonResponse({ access_token: 'pkce-access', refresh_token: 'pkce-refresh', expires_in: 3600 });
    },
  });
  let cleaned = '';
  const result = await client.consumeAuthCallback(
    'https://registro.crediteksas.com/creditek/agentes/?code=one-time-code',
    value => { cleaned = value; },
  );
  assert.deepEqual(result, { mode: 'set-password', type: 'recovery' });
  assert.match(calls[0].url, /\/auth\/v1\/token\?grant_type=pkce$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    auth_code: 'one-time-code',
    code_verifier: 'v'.repeat(64),
  });
  assert.equal(storage.getItem(verifierKey), null);
  assert.equal(storage.getItem(`${AURA_AUTH.storage}-flow-type`), null);
  assert.equal(cleaned, '/creditek/agentes/');
});

test('un callback vencido, inválido o reutilizado falla seguro y conserva el callback para recuperación', async () => {
  const { createAuraAuthClient, AURA_AUTH } = await import('../../creditek/agentes/aura-auth.mjs');
  const verifierKey = `${AURA_AUTH.storage}-code-verifier`;
  const storage = memoryStorage({ [verifierKey]: 'e'.repeat(64) });
  const client = createAuraAuthClient({
    storage,
    fetchImpl: async () => jsonResponse({ error: 'invalid_grant', error_description: 'code expired' }, 400),
  });
  let cleaned = '';
  const result = await client.consumeAuthCallback(
    'https://registro.crediteksas.com/creditek/agentes/?code=reused-code&type=recovery',
    value => { cleaned = value; },
  );
  assert.equal(result.mode, 'callback-error');
  assert.match(result.message, /venció|utilizado|inválido/i);
  assert.doesNotMatch(result.message, /reused-code|expired-verifier|invalid_grant/);
  assert.equal(cleaned, '');
  assert.equal(storage.getItem(verifierKey), 'e'.repeat(64));
  assert.equal(client.session(), null);
});

test('un callback sin verificador no limpia el code ni permite que continúe el login', async () => {
  const { createAuraAuthClient } = await import('../../creditek/agentes/aura-auth.mjs');
  const storage = memoryStorage();
  let cleaned = '';
  const client = createAuraAuthClient({ storage, fetchImpl: async () => jsonResponse({}) });
  const result = await client.consumeAuthCallback(
    'https://registro.crediteksas.com/creditek/agentes/?code=orphan-code&type=recovery',
    value => { cleaned = value; },
  );
  assert.equal(result.mode, 'callback-error');
  assert.equal(cleaned, '');
  assert.equal(client.session(), null);
});

test('un verificador corrupto falla antes del intercambio y conserva el callback', async () => {
  const { createAuraAuthClient, AURA_AUTH } = await import('../../creditek/agentes/aura-auth.mjs');
  const storage = memoryStorage({
    [`${AURA_AUTH.storage}-code-verifier`]: 'corrupto',
    [`${AURA_AUTH.storage}-flow-type`]: 'recovery',
  });
  let fetches = 0;
  let cleaned = '';
  const client = createAuraAuthClient({
    storage,
    fetchImpl: async () => { fetches += 1; return jsonResponse({}); },
  });
  const result = await client.consumeAuthCallback(
    'https://registro.crediteksas.com/creditek/agentes/?code=valid-looking-code',
    value => { cleaned = value; },
  );
  assert.equal(result.mode, 'callback-error');
  assert.equal(fetches, 0);
  assert.equal(cleaned, '');
});

test('la doble apertura del mismo enlace no reutiliza la sesión PKCE', async () => {
  const { createAuraAuthClient, AURA_AUTH } = await import('../../creditek/agentes/aura-auth.mjs');
  const storage = memoryStorage({
    [`${AURA_AUTH.storage}-code-verifier`]: 'd'.repeat(64),
    [`${AURA_AUTH.storage}-flow-type`]: 'recovery',
  });
  let exchanges = 0;
  const client = createAuraAuthClient({
    storage,
    fetchImpl: async () => {
      exchanges += 1;
      return jsonResponse({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 });
    },
  });
  const url = 'https://registro.crediteksas.com/creditek/agentes/?code=single-use-code';
  assert.equal((await client.consumeAuthCallback(url)).mode, 'set-password');
  assert.equal((await client.consumeAuthCallback(url)).mode, 'callback-error');
  assert.equal(exchanges, 1);
});

test('actualiza la contraseña con la sesión del enlace y conserva el acceso AURA', async () => {
  const { createAuraAuthClient, AURA_AUTH } = await import('../../creditek/agentes/aura-auth.mjs');
  const storage = memoryStorage({
    [AURA_AUTH.storage]: JSON.stringify({ access_token: 'access', refresh_token: 'refresh', expires_at: 9999999999 }),
  });
  const calls = [];
  const client = createAuraAuthClient({
    storage,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/auth/v1/user')) return jsonResponse({ id: 'user-1' });
      if (url.includes('/rest/v1/rpc/aura_my_access')) {
        return jsonResponse({ email: 'comercial@crediteksas.com', apps: [{ app_id: 'sofia', permissions: ['sofia.use'] }] });
      }
      return jsonResponse({});
    },
  });
  const access = await client.updatePassword('Nueva-clave-segura-2026');
  assert.equal(calls[0].options.method, 'PUT');
  assert.equal(calls[0].options.headers.authorization, 'Bearer access');
  assert.deepEqual(JSON.parse(calls[0].options.body), { password: 'Nueva-clave-segura-2026' });
  assert.equal(access.email, 'comercial@crediteksas.com');
});

test('la interfaz AURA ofrece los cinco estados con apariencia premium y accesible', async () => {
  const html = await read('creditek/agentes/index.html');
  assert.match(html, />AURA<\/h1>/);
  assert.match(html, />by Creditek<\/p>/);
  assert.match(html, /id="auth-view-login"/);
  assert.match(html, /id="auth-view-forgot"/);
  assert.match(html, /id="auth-view-set-password"/);
  assert.match(html, /id="auth-view-password-updated"/);
  assert.match(html, /Olvidé mi contraseña/);
  assert.match(html, /id="remember-session"/);
  assert.match(html, /Mostrar contraseña|aria-label="Mostrar/);
  assert.match(html, /Nueva contraseña/);
  assert.match(html, /Confirmar contraseña/);
  assert.match(html, /#0B1E3D/i);
  assert.match(html, /#00C4CC/i);
  assert.match(html, /box-shadow/);
  assert.match(html, /border-radius/);
  assert.match(html, /@media\s*\(max-width/);
  assert.match(html, /requestPasswordRecovery/);
  assert.match(html, /consumeAuthCallback/);
  assert.match(html, /updatePassword/);
  assert.match(html, /handleAuraEntry/);
  assert.match(html, /addEventListener\(['"]hashchange['"]/);
  assert.match(html, /addEventListener\(['"]pageshow['"]/);
  assert.match(html, /addEventListener\(['"]popstate['"]/);
  assert.match(html, /document\.readyState/);
  assert.doesNotMatch(html, /access_token\s*[=:]|refresh_token\s*[=:]/);
});

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
  const client = createAuraAuthClient({
    storage: memoryStorage(),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({});
    },
  });

  const result = await client.requestPasswordRecovery('Comercial@CreditekSAS.com');
  assert.equal(result.message, 'Si el correo está registrado, recibirás un enlace para crear una nueva contraseña.');
  assert.match(calls[0].url, /\/auth\/v1\/recover\?redirect_to=/);
  assert.equal(new URL(calls[0].url).searchParams.get('redirect_to'), AURA_RECOVERY_REDIRECT);
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: 'comercial@crediteksas.com' });
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
  const storage = memoryStorage({ [verifierKey]: 'verifier-value' });
  const calls = [];
  const client = createAuraAuthClient({
    storage,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ access_token: 'pkce-access', refresh_token: 'pkce-refresh', expires_in: 3600 });
    },
  });
  let cleaned = '';
  const result = await client.consumeAuthCallback(
    'https://registro.crediteksas.com/creditek/agentes/?code=one-time-code&type=invite',
    value => { cleaned = value; },
  );
  assert.deepEqual(result, { mode: 'set-password', type: 'invite' });
  assert.match(calls[0].url, /\/auth\/v1\/token\?grant_type=pkce$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    auth_code: 'one-time-code',
    code_verifier: 'verifier-value',
  });
  assert.equal(storage.getItem(verifierKey), null);
  assert.equal(cleaned, '/creditek/agentes/');
});

test('un callback vencido, inválido o reutilizado falla seguro y limpia parámetros sensibles', async () => {
  const { createAuraAuthClient, AURA_AUTH } = await import('../../creditek/agentes/aura-auth.mjs');
  const verifierKey = `${AURA_AUTH.storage}-code-verifier`;
  const storage = memoryStorage({ [verifierKey]: 'expired-verifier' });
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
  assert.equal(cleaned, '/creditek/agentes/');
  assert.equal(client.session(), null);
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
  assert.doesNotMatch(html, /access_token\s*[=:]|refresh_token\s*[=:]/);
});

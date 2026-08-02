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
    entries: () => [...values.entries()],
  };
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('solicita un código de recuperación sin enlace ni desafío PKCE', async () => {
  const { createAuraAuthClient } = await import('../../creditek/agentes/aura-auth.mjs');
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
  assert.equal(result.message, 'Si el correo está registrado, recibirás un código de seis dígitos.');
  assert.match(calls[0].url, /\/auth\/v1\/recover$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: 'comercial@crediteksas.com' });
  assert.equal(storage.entries().some(([key]) => /verifier|recovery|otp|code/i.test(key)), false);
});

test('un segundo envío limitado con 429 no altera sesión ni estado local', async () => {
  const { createAuraAuthClient, AURA_AUTH } = await import('../../creditek/agentes/aura-auth.mjs');
  const existing = JSON.stringify({ access_token: 'existing', refresh_token: 'refresh', expires_at: 9999999999 });
  const storage = memoryStorage({ [AURA_AUTH.storage]: existing });
  const client = createAuraAuthClient({
    storage,
    fetchImpl: async () => jsonResponse({ error_code: 'over_email_send_rate_limit' }, 429),
  });
  await assert.rejects(client.requestPasswordRecovery('comercial@crediteksas.com'), /demasiadas solicitudes/i);
  assert.equal(storage.getItem(AURA_AUTH.storage), existing);
  assert.equal(storage.entries().some(([key]) => /verifier|recovery|otp|code/i.test(key)), false);
});

test('verifica el OTP recovery y crea una sesión sin persistir el código', async () => {
  const { createAuraAuthClient, AURA_AUTH } = await import('../../creditek/agentes/aura-auth.mjs');
  const storage = memoryStorage();
  const calls = [];
  const client = createAuraAuthClient({
    storage,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ access_token: 'otp-access', refresh_token: 'otp-refresh', expires_in: 3600 });
    },
  });

  const result = await client.verifyRecoveryCode('Comercial@CreditekSAS.com', '123456');
  assert.deepEqual(result, { verified: true });
  assert.match(calls[0].url, /\/auth\/v1\/verify$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    email: 'comercial@crediteksas.com',
    token: '123456',
    type: 'recovery',
  });
  assert.equal(client.session().access_token, 'otp-access');
  assert.equal(storage.getItem(AURA_AUTH.storage).includes('123456'), false);
  assert.equal(storage.entries().some(([, value]) => value === '123456'), false);
});

test('rechaza localmente códigos con formato incorrecto', async () => {
  const { createAuraAuthClient } = await import('../../creditek/agentes/aura-auth.mjs');
  let fetches = 0;
  const client = createAuraAuthClient({
    storage: memoryStorage(),
    fetchImpl: async () => { fetches += 1; return jsonResponse({}); },
  });
  for (const invalid of ['', '12345', '1234567', '12A456']) {
    await assert.rejects(client.verifyRecoveryCode('comercial@crediteksas.com', invalid), /seis dígitos/i);
  }
  assert.equal(fetches, 0);
});

test('distingue código incorrecto, vencido o reutilizado sin exponer detalles técnicos', async () => {
  const { createAuraAuthClient } = await import('../../creditek/agentes/aura-auth.mjs');
  for (const errorCode of ['otp_expired', 'otp_disabled', 'bad_code_verifier']) {
    const client = createAuraAuthClient({
      storage: memoryStorage(),
      fetchImpl: async () => jsonResponse({ error_code: errorCode, msg: 'sensitive backend detail' }, 403),
    });
    await assert.rejects(
      client.verifyRecoveryCode('comercial@crediteksas.com', '123456'),
      error => /inválido|venció|utilizado/i.test(error.message)
        && !error.message.includes(errorCode)
        && !error.message.includes('sensitive'),
    );
  }
});

test('el código queda inutilizable después de la primera verificación', async () => {
  const { createAuraAuthClient } = await import('../../creditek/agentes/aura-auth.mjs');
  let attempts = 0;
  const client = createAuraAuthClient({
    storage: memoryStorage(),
    fetchImpl: async () => {
      attempts += 1;
      return attempts === 1
        ? jsonResponse({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 })
        : jsonResponse({ error_code: 'otp_expired' }, 403);
    },
  });
  assert.deepEqual(await client.verifyRecoveryCode('comercial@crediteksas.com', '123456'), { verified: true });
  await assert.rejects(client.verifyRecoveryCode('comercial@crediteksas.com', '123456'), /venció|utilizado|inválido/i);
});

test('actualiza la contraseña con la sesión OTP y conserva el acceso AURA', async () => {
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

test('la interfaz AURA ofrece recuperación por código sin callback PKCE', async () => {
  const html = await read('creditek/agentes/index.html');
  assert.match(html, /id="auth-view-login"/);
  assert.match(html, /id="auth-view-forgot"/);
  assert.match(html, /id="auth-view-verify-code"/);
  assert.match(html, /id="recovery-code"[^>]*inputmode="numeric"/);
  assert.match(html, /Código de verificación/);
  assert.match(html, /Nueva contraseña/);
  assert.match(html, /Confirmar contraseña/);
  assert.match(html, /verifyRecoveryCode/);
  assert.match(html, /requestPasswordRecovery/);
  assert.match(html, /aura-auth\.mjs\?v=20260802-otp1/);
  assert.doesNotMatch(html, /consumeAuthCallback|handleAuraEntry|code_verifier|grant_type=pkce/);
  assert.doesNotMatch(html, /Clave de acceso|Acceso pausado|Sistema operativo/i);
});

test('el build no contiene secretos, códigos persistentes ni la pantalla histórica', async () => {
  const [html, auth] = await Promise.all([
    read('creditek/agentes/index.html'),
    read('creditek/agentes/aura-auth.mjs'),
  ]);
  const published = `${html}\n${auth}`;
  assert.doesNotMatch(published, /localStorage\.setItem\([^\n]*(recovery[_-]?(otp|code)|code[_-]?verifier)/i);
  assert.doesNotMatch(published, /console\.(log|warn|error)/);
  assert.doesNotMatch(published, /Clave de acceso|Acceso pausado|Sistema operativo/i);
});

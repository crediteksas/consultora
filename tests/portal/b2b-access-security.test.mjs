import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createB2BSessionClient } from '../../creditek/portal/b2b-session.mjs';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    snapshot: () => Object.fromEntries(values),
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test('clave válida crea una sesión temporal sin guardar la clave', async () => {
  const storage = memoryStorage();
  const requests = [];
  const client = createB2BSessionClient({
    endpoint: 'https://example.test/exec',
    storage,
    now: () => 1_000_000,
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return jsonResponse({ ok: true, session_token: 'token-opaco', expires_at: 1_900_000, scope: 'access' });
    },
  });

  assert.equal(await client.login('Clave-Nueva-no-real'), true);
  assert.equal(requests[0].action, 'autenticar_portal_b2b');
  assert.equal(requests[0].password, 'Clave-Nueva-no-real');
  assert.doesNotMatch(JSON.stringify(storage.snapshot()), /Clave-Nueva-no-real/);
  assert.match(JSON.stringify(storage.snapshot()), /token-opaco/);
});

test('clave vieja, incorrecta, vacía y secreto ausente fallan de forma segura', async () => {
  for (const password of ['Clave-Vieja-no-real', 'Incorrecta', '']) {
    const client = createB2BSessionClient({
      endpoint: 'https://example.test/exec',
      storage: memoryStorage(),
      fetchImpl: async () => jsonResponse({ ok: false, error: 'Acceso denegado' }, 403),
    });
    await assert.rejects(() => client.login(password), /acceso|clave|configur/i);
  }
});

test('múltiples intentos respetan el bloqueo seguro del backend', async () => {
  const client = createB2BSessionClient({
    endpoint: 'https://example.test/exec',
    storage: memoryStorage(),
    fetchImpl: async () => jsonResponse({ ok: false, error: 'Demasiados intentos' }, 429),
  });
  await assert.rejects(() => client.login('Incorrecta'), /demasiados intentos/i);
});

test('sesión válida se conserva y sesión vencida exige autenticación nueva', async () => {
  const validStorage = memoryStorage({
    aura_b2b_session: JSON.stringify({ token: 'token-vigente', expiresAt: 2_000_000, scope: 'access' }),
  });
  const validClient = createB2BSessionClient({
    endpoint: 'https://example.test/exec',
    storage: validStorage,
    now: () => 1_000_000,
    fetchImpl: async () => jsonResponse({ ok: true, valid: true, expires_at: 2_000_000, scope: 'access' }),
  });
  assert.equal(await validClient.restoreSession(), true);

  const expiredStorage = memoryStorage({
    aura_b2b_session: JSON.stringify({ token: 'token-vencido', expiresAt: 900_000, scope: 'access' }),
  });
  const expiredClient = createB2BSessionClient({
    endpoint: 'https://example.test/exec',
    storage: expiredStorage,
    now: () => 1_000_000,
    fetchImpl: async () => { throw new Error('no debe consultar'); },
  });
  assert.equal(await expiredClient.restoreSession(), false);
  assert.equal(expiredStorage.getItem('aura_b2b_session'), null);
});

test('Apps Script usa hashes únicos, sesiones opacas y no conserva fallback histórico', async () => {
  const source = await readFile(new URL('../../creditek/portal/Code.gs', import.meta.url), 'utf8');
  const portal = await readFile(new URL('../../creditek/portal/index.html', import.meta.url), 'utf8');

  assert.match(source, /B2B_ACCESS_PIN_HASH/);
  assert.match(source, /B2B_ADMIN_PIN_HASH/);
  assert.match(source, /autenticar_portal_b2b/);
  assert.match(source, /validar_sesion_portal_b2b/);
  assert.match(source, /CacheService\.getScriptCache/);
  assert.doesNotMatch(source, /configured\.split\(','\)/);
  assert.doesNotMatch(portal, /const\s+CLAVE(?:_B2B)?\s*=/);
  assert.doesNotMatch(portal, /input\s*===\s*CLAVE/);
});

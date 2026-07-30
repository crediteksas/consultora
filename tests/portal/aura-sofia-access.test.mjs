import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  ensureAuraSession,
  isSessionUsable,
} from '../../creditek/agentes/aura-session.mjs';

const root = new URL('../../', import.meta.url);
const hubPath = new URL('creditek/agentes/index.html', root);
const sofiaPath = new URL('creditek/agentes/creditek-agente-respuestas.html', root);

const storage = initial => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
};

test('reconoce una sesión Supabase vigente sin renovarla', async () => {
  const now = 1_800_000_000_000;
  const session = { access_token: 'public-test-token', expires_at: Math.floor(now / 1000) + 600 };
  assert.equal(isSessionUsable(session, now), true);

  let requests = 0;
  const result = await ensureAuraSession({
    storage: storage({ ck_supa_session: JSON.stringify(session) }),
    fetchImpl: async () => { requests += 1; },
    endpoint: 'https://example.test/hub-login',
    gate: 'test-gate',
    now,
  });

  assert.equal(result.ok, true);
  assert.equal(requests, 0);
});

test('restablece la sesión antes de abrir Sofía cuando ck_auth existe por separado', async () => {
  const browserStorage = storage({ ck_auth: '1' });
  const result = await ensureAuraSession({
    storage: browserStorage,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        access_token: 'new-public-test-token',
        refresh_token: 'new-public-refresh-token',
        expires_at: 1_900_000_000,
        email: 'test@example.invalid',
      }),
    }),
    endpoint: 'https://example.test/hub-login',
    gate: 'test-gate',
    now: 1_800_000_000_000,
  });

  assert.equal(result.ok, true);
  assert.equal(JSON.parse(browserStorage.getItem('ck_supa_session')).access_token, 'new-public-test-token');
});

test('un fallo de sesión muestra un error y no expulsa al usuario del hub', async () => {
  const hub = await readFile(hubPath, 'utf8');
  const sofia = await readFile(sofiaPath, 'utf8');

  assert.match(hub, /ensureAuraSession/);
  assert.match(hub, /No fue posible abrir Sofía/);
  assert.match(hub, /aura:close-module/);
  assert.doesNotMatch(sofia, /top\.location\.href\s*=/);
  assert.match(sofia, /showAccessError/);
  assert.match(sofia, /No tienes una sesión válida para consultar Sofía/);
});

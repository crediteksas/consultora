import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticateAura, inspectBearer } from '../../creditek/workers/gemini-proxy/auth.mjs';

const env = {
  SUPABASE_URL: 'https://ditiwpndvmyuqcagupea.supabase.co',
  SUPABASE_ANON_KEY: 'anon-test',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  SUPABASE_JWT_ISSUER: 'https://ditiwpndvmyuqcagupea.supabase.co/auth/v1',
};

function token(payload) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

function request(value) {
  return new Request('https://worker.test/generate', value ? { headers: { Authorization: `Bearer ${value}` } } : {});
}

function fetcherFor(payload = { user_id: 'user-1', active: true, apps: ['agente1'] }) {
  return async url => String(url).endsWith('/auth/v1/user')
    ? Response.json({ id: 'user-1' })
    : Response.json(payload);
}

test('acepta una sesión AURA válida', async () => {
  const jwt = token({
    iss: env.SUPABASE_JWT_ISSUER,
    aud: 'authenticated',
    sub: 'user-1',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  assert.equal(await authenticateAura(request(jwt), env, fetcherFor()), true);
});

test('rechaza token ausente, expirado, de otro proyecto y mal formado', async () => {
  const now = Math.floor(Date.now() / 1000);
  const base = { aud: 'authenticated', sub: 'user-1', exp: now + 3600 };
  assert.equal(await authenticateAura(request(), env, fetcherFor()), false);
  assert.equal(await authenticateAura(request(token({ ...base, iss: env.SUPABASE_JWT_ISSUER, exp: now - 1 })), env, fetcherFor()), false);
  assert.equal(await authenticateAura(request(token({ ...base, iss: 'https://other.supabase.co/auth/v1' })), env, fetcherFor()), false);
  assert.equal(await authenticateAura(request('not-a-jwt'), env, fetcherFor()), false);
});

test('el diagnóstico conserva claims sanitizados sin publicar el JWT', () => {
  const jwt = token({ iss: env.SUPABASE_JWT_ISSUER, aud: 'authenticated', sub: 'user-1', exp: 123 });
  const info = inspectBearer(`Bearer ${jwt}`);
  assert.equal(info.token_present, true);
  assert.equal(info.token_format_valid, true);
  assert.equal(info.sub_present, true);
  assert.equal(info.exp, 123);
  assert.equal(Object.hasOwn(info, 'token'), false);
});

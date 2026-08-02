import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => readFile(path.join(root, relative), 'utf8');

test('AURA auth client keeps one Supabase session and evaluates app permissions', async () => {
  const auth = await import('../../creditek/agentes/aura-auth.mjs');
  const access = {
    apps: [
      { app_id: 'portal_b2b', role_id: 'portal_b2b.admin', permissions: ['portal.read'] },
      { app_id: 'sofia', role_id: 'aura.owner', permissions: ['sofia.use'] },
    ],
  };
  assert.equal(auth.hasPermission(access, 'portal_b2b', 'portal.read'), true);
  assert.equal(auth.hasPermission(access, 'sofia', 'sofia.use'), true);
  assert.equal(auth.hasPermission(access, 'sofia', 'sofia.admin'), false);
  assert.equal(auth.portalDecision({ session: {}, access }), 'allow');
  assert.equal(auth.portalDecision({ session: {}, access: { apps: [] } }), 'deny');
  assert.equal(auth.portalDecision({ session: null, access: null }), 'redirect');
});

test('return destinations are restricted to AURA and Portal paths', async () => {
  const { sanitizeReturnTo, loginUrlFor } = await import('../../creditek/agentes/aura-auth.mjs');
  assert.equal(sanitizeReturnTo('/creditek/portal/'), '/creditek/portal/');
  assert.equal(sanitizeReturnTo('/creditek/agentes/creditek-agente-respuestas.html'), '/creditek/agentes/creditek-agente-respuestas.html');
  assert.equal(sanitizeReturnTo('https://evil.example/'), '');
  assert.equal(sanitizeReturnTo('/creditek/erp/app'), '');
  assert.match(loginUrlFor('/creditek/portal/'), /^\/creditek\/agentes\/?\?return_to=/);
});

test('AURA is the only login and renders modules from the authenticated access profile', async () => {
  const html = await read('creditek/agentes/index.html');
  assert.match(html, /type="email"[^>]+id="login-email"/);
  assert.match(html, /type="password"[^>]+id="login-password"/);
  assert.match(html, /aura-auth(?:-otp-20260802)?\.mjs/);
  assert.match(html, /data-aura-app="portal_b2b"/);
  assert.match(html, /data-aura-app="sofia"/);
  assert.match(html, /renderAuthorizedModules/);
  assert.match(html, /return_to/);
  assert.doesNotMatch(html, /const\s+PWD\s*=/);
  assert.doesNotMatch(html, /ck_auth|hub-login/);
});

test('Portal has no independent login and guards direct navigation with AURA session', async () => {
  const html = await read('creditek/portal/index.html');
  assert.match(html, /aura-portal-bootstrap\.mjs/);
  assert.match(html, /id="portalAccessDenied"/);
  assert.doesNotMatch(html, /b2b-login-overlay|id="b2bPass"|id="passInput"/);
  assert.doesNotMatch(html, /verificarB2B|verificarPass|B2BAccessSession/);
  assert.doesNotMatch(html, /autenticar_portal_b2b|validar_sesion_portal_b2b/);
});

test('Portal auth guard redirects, denies or opens based on the AURA permission', async () => {
  const guard = await import('../../creditek/portal/aura-portal-guard.mjs');
  assert.equal(guard.decidePortalAccess(null, null), 'redirect');
  assert.equal(guard.decidePortalAccess({}, { apps: [] }), 'deny');
  assert.equal(guard.decidePortalAccess({}, {
    apps: [{ app_id: 'portal_b2b', permissions: ['portal.read'] }],
  }), 'allow');
  assert.equal(guard.AURA_LOGIN_PATH, '/creditek/agentes/');
});

test('Portal bootstrap applies the operator store scope and admin permission', async () => {
  const bootstrap = await read('creditek/portal/aura-portal-bootstrap.mjs');
  assert.match(bootstrap, /grant\?\.scope\?\.stores/);
  assert.match(bootstrap, /stores\.includes\(store\)/);
  assert.match(bootstrap, /portal\.admin/);
});

test('AURA logout revokes Supabase Auth and therefore invalidates Portal B2B', async () => {
  const auth = await read('creditek/agentes/aura-auth.mjs');
  const shell = await read('creditek/agentes/index.html');
  assert.match(auth, /\/auth\/v1\/logout/);
  assert.match(auth, /removeItem\(STORAGE_KEY\)/);
  assert.match(shell, /await\s+auraAuth\.signOut\(\)/);
});

test('the isolated Portal build ships the guard and never ships the retired session gate', async () => {
  const build = await read('scripts/build-aura-b2b.mjs');
  assert.match(build, /creditek\/portal\/aura-portal-guard\.mjs/);
  assert.doesNotMatch(build, /creditek\/portal\/b2b-session\.mjs/);
});

test('AURA API validates Supabase identity, app role, permissions and operator scope', async () => {
  const worker = await read('creditek/workers/aura-b2b-api/src/index.ts');
  const config = await read('creditek/workers/aura-b2b-api/wrangler.toml');
  assert.match(worker, /\/auth\/v1\/user/);
  assert.match(worker, /aura_my_access/);
  assert.match(worker, /app_id === APP_ID/);
  assert.match(worker, /has\(grant, permission\)/);
  assert.match(worker, /withinScope\(grant, store\)/);
  assert.match(worker, /STORE_CITIES/);
  assert.match(worker, /precioProveedor: purchasePrice/);
  assert.match(worker, /precioCredilek: salePrice/);
  assert.match(worker, /ciudad: STORE_CITIES\[store\]/);
  assert.match(worker, /portal\.admin/);
  assert.match(config, /SUPABASE_URL\s*=\s*"https:\/\/ditiwpndvmyuqcagupea\.supabase\.co"/);
  assert.doesNotMatch(worker, /\bkora\b/i);
});

test('AURA hub deploy is isolated from Portal, ERP and KORA routes', async () => {
  const config = await read('wrangler.aura-hub.jsonc');
  const build = await read('scripts/build-aura-hub.mjs');
  assert.doesNotMatch(config, /creditek\/agentes\/\*/);
  assert.match(config, /creditek\/agentes\/index\.html/);
  assert.match(config, /creditek\/agentes\/aura-auth\.mjs/);
  assert.doesNotMatch(config, /creditek\/portal|creditek\/erp|kora/i);
  assert.match(build, /creditek', 'agentes/);
  assert.match(build, /\['index\.html', 'aura-auth\.mjs'\]/);
  assert.doesNotMatch(build, /cp\([^;]+recursive:\s*true/);
  assert.doesNotMatch(build, /portal|erp|kora/i);
});

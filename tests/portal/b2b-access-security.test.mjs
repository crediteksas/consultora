import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = relative => readFile(new URL(`../../${relative}`, import.meta.url), 'utf8');

test('Portal B2B delegates identity to the single AURA Supabase session', async () => {
  const html = await read('creditek/portal/index.html');
  const guard = await read('creditek/portal/aura-portal-guard.mjs');
  const auth = await read('creditek/agentes/aura-auth.mjs');
  assert.match(html, /aura-portal-bootstrap\.mjs/);
  assert.match(guard + auth, /portal\.read/);
  assert.match(auth, /grant_type=password/);
  assert.match(auth, /grant_type=refresh_token/);
  assert.match(auth, /auth\/v1\/logout/);
  assert.doesNotMatch(html + guard + auth, /B2B_ACCESS_PIN_HASH|B2B_ADMIN_PIN_HASH|aura_b2b_session/);
});

test('Apps Script accepts only the authenticated AURA backend contract', async () => {
  const source = await read('creditek/portal/Code.gs');
  assert.match(source, /AURA_BACKEND_SECRET/);
  assert.match(source, /verificarBackendAura_/);
  assert.doesNotMatch(source, /autenticar_portal_b2b|validar_sesion_portal_b2b/);
  assert.doesNotMatch(source, /B2B_ACCESS_PIN_HASH|B2B_ADMIN_PIN_HASH/);
});

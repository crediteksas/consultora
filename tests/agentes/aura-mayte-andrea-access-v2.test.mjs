import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { AURA_CAPABILITIES, hasAuraCapability, isAuraFunctionalAdmin } from '../../creditek/agentes/aura-access-policy.mjs';
import { authenticateAuraCapability } from '../../src/aura-enlaces-proxy.mjs';
import { handleAuraAccessCheck } from '../../src/aura-access-check.mjs';

const access = (role, permissions = []) => ({ active: true, apps: [{ app_id: 'aura', role_id: role, permissions }] });

test('aura.admin tiene acceso funcional completo dentro de AURA', () => {
  const mayte = access('aura.admin');
  assert.equal(isAuraFunctionalAdmin(mayte), true);
  for (const capability of Object.values(AURA_CAPABILITIES)) assert.equal(hasAuraCapability(mayte, capability), true);
});

test('aura.andrea_limited permite solo las cuatro capacidades aprobadas', () => {
  const andrea = access('aura.andrea_limited');
  for (const capability of ['convenios.read', 'general_link.read', 'cartera.read', 'consultas.read']) {
    assert.equal(hasAuraCapability(andrea, capability), true);
  }
  for (const capability of ['sofia.use', 'nova.read', 'clientes.read', 'aura.config']) {
    assert.equal(hasAuraCapability(andrea, capability), false);
  }
});

test('un permiso explícito existente continúa siendo respetado', () => {
  assert.equal(hasAuraCapability(access('aura.user', ['cartera.read']), 'cartera.read'), true);
  assert.equal(hasAuraCapability(access('aura.user', ['cartera.read']), 'nova.read'), false);
});

test('la guarda server-side responde DENY a rutas sin capacidad', async () => {
  const request = new Request('https://aura.test/api/aura/access', { headers: { authorization: 'Bearer test' } });
  const fetcher = async input => {
    const url = String(input.url || input);
    if (url.includes('/auth/v1/user')) return Response.json({ id: 'u1', email: 'andrea@test.local' });
    return Response.json({ user_id: 'u1', email: 'andrea@test.local', active: true, apps: [{ app_id: 'aura', role_id: 'aura.andrea_limited', permissions: [] }] });
  };
  assert.ok(await authenticateAuraCapability(request, 'cartera.read', fetcher));
  assert.equal(await authenticateAuraCapability(request, 'nova.read', fetcher), null);
  const denied = await handleAuraAccessCheck(new Request('https://aura.test/api/aura/access?capability=nova.read', { headers: { authorization: 'Bearer test' } }), fetcher);
  const allowed = await handleAuraAccessCheck(new Request('https://aura.test/api/aura/access?capability=cartera.read', { headers: { authorization: 'Bearer test' } }), fetcher);
  assert.equal(denied.status, 403);
  assert.equal(allowed.status, 200);
});

test('Consultas reutiliza Buscar / Registrar y no inventa una pantalla', async () => {
  const html = await readFile(new URL('../../creditek/agentes/index.html', import.meta.url), 'utf8');
  assert.match(html, /data-aura-capability="consultas\.read"[^>]*openClientsModule\('search','Buscar \/ Registrar'/);
  assert.doesNotMatch(html, />Consultas<\/span>/);
});

test('shell consume permisos explícitos de Convenios, Cartera y Sistema', async () => {
  const html = await readFile(new URL('../../creditek/agentes/index.html', import.meta.url), 'utf8');
  assert.match(html, /data-aura-capability="convenios\.read"[^>]*onclick="openModule\([^\n]+,'convenios'\)/);
  assert.match(html, /data-aura-capability="cartera\.read"/);
  assert.match(html, /data-aura-capability="aura\.config"/);
});

test('las páginas compartidas vuelven a validar la ruta directa', async () => {
  const [nova, cartera] = await Promise.all([
    readFile(new URL('../../creditek/agentes/aura-nova.js', import.meta.url), 'utf8'),
    readFile(new URL('../../creditek/agentes/aura-cartera.js', import.meta.url), 'utf8'),
  ]);
  assert.match(nova, /routeAllowed\(requestedRoute\)\?requestedRoute:'denied'/);
  assert.match(nova, /AURA_CAPABILITIES\.CONSULTAS/);
  assert.match(nova, /AURA_CAPABILITIES\.NOVA/);
  assert.match(cartera, /hasAuraCapability\(carteraAccess,AURA_CAPABILITIES\.CARTERA\)/);
  assert.match(`${nova}\n${cartera}`, /HTTP 403/);
});

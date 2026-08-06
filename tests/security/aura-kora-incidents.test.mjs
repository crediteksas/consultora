import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workerSource = await readFile(new URL('../../creditek/workers/aura-hub/src/index.js', import.meta.url), 'utf8');
const auraSource = await readFile(new URL('../../creditek/agentes/index.html', import.meta.url), 'utf8');
const migration = await readFile(
  new URL('../../creditek/erp/migrations/20260806_kora_aura_incident_bridge.sql', import.meta.url),
  'utf8',
).catch(() => '');

test('AURA envía incidencias al backend autenticado y muestra el código KORA', () => {
  assert.match(auraSource, /\/api\/incidents/);
  assert.match(auraSource, /auraAuth\.token\(\)/);
  assert.match(auraSource, /incident_code/);
  assert.doesNotMatch(auraSource, /jfkmiyvcdfbsbwchyvol|service_role|KORA_SUPABASE_SERVICE/);
});

test('aura-hub reserva una ruta backend para incidencias corporativas', () => {
  assert.match(workerSource, /pathname === '\/creditek\/agentes\/api\/incidents'/);
  assert.match(workerSource, /createCorporateIncident/);
  assert.doesNotMatch(workerSource, /KORA_SUPABASE_SERVICE_KEY\s*[:=]\s*['"][^'"]+/);
});

test('la migración puente reutiliza KORA, mapea identidad real y solo se concede a service_role', () => {
  assert.match(migration, /kora_create_incident_from_aura/);
  assert.match(migration, /from auth\.users/);
  assert.match(migration, /join public\.perfiles/);
  assert.match(migration, /kora_incidents/);
  assert.match(migration, /kora_incident_history/);
  assert.match(migration, /kora_incident_notifications/);
  assert.match(migration, /source_system.*aura/s);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/);
});

test('el puente backend rechaza falta de sesión y perfiles no mapeados', async () => {
  const { createCorporateIncident } = await import('../../creditek/workers/aura-hub/src/incidents.mjs');
  const noSession = await createCorporateIncident(
    new Request('https://registro.crediteksas.com/creditek/agentes/api/incidents', { method: 'POST' }),
    {},
    async () => { throw new Error('no debe consultar'); },
  );
  assert.equal(noSession.status, 401);

  const calls = [];
  const unmapped = await createCorporateIncident(
    new Request('https://registro.crediteksas.com/creditek/agentes/api/incidents', {
      method: 'POST',
      headers: { Authorization: 'Bearer aura-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Fallo visible', description: 'La pantalla no carga correctamente.', expected: 'Debe cargar sin errores.', module: 'Panel general', priority: 'alta' }),
    }),
    { KORA_SUPABASE_SERVICE_KEY: 'server-only' },
    async (url) => {
      calls.push(String(url));
      if (String(url).includes('/auth/v1/user')) return Response.json({ id: 'aura-id', email: 'oscar@crediteksas.com' });
      if (String(url).includes('/rpc/aura_my_access')) return Response.json({ active: true, role: 'aura.owner', apps: [] });
      if (String(url).includes('/auth/v1/admin/users')) return Response.json({ users: [] });
      throw new Error(`ruta no esperada: ${url}`);
    },
  );
  assert.equal(unmapped.status, 409);
  assert.match((await unmapped.json()).error, /perfil KORA/i);
  assert.ok(calls.some(url => url.includes('/auth/v1/admin/users')));
});

test('el rol owner se reconoce en la estructura real de aura_my_access', async () => {
  const { createCorporateIncident } = await import('../../creditek/workers/aura-hub/src/incidents.mjs');
  const response = await createCorporateIncident(
    new Request('https://registro.crediteksas.com/creditek/agentes/api/incidents', {
      method: 'POST',
      headers: { Authorization: 'Bearer aura-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Incidencia de prueba',
        description: 'Descripción suficientemente detallada.',
        expected: 'El flujo debe funcionar.',
      }),
    }),
    { KORA_SUPABASE_SERVICE_KEY: 'server-only' },
    async (url) => {
      if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'aura-u1', email: 'owner@example.com' });
      if (String(url).includes('/rpc/aura_my_access')) return Response.json({
        user_id: 'aura-u1',
        email: 'owner@example.com',
        apps: [{ app_id: 'sofia', role_id: 'aura.owner', permissions: [] }],
      });
      if (String(url).includes('/auth/v1/admin/users')) return Response.json({ users: [{ id: 'kora-u1', email: 'owner@example.com' }] });
      if (String(url).includes('/rpc/kora_create_incident_from_aura')) {
        return Response.json({ id: 'incident-1', incident_code: 'KORA-2026-0001', reused: false });
      }
      throw new Error(`ruta no esperada: ${url}`);
    },
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).incident_code, 'KORA-2026-0001');
});

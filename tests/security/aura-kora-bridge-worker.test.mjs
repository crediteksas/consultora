import test from 'node:test';
import assert from 'node:assert/strict';
import { createCorporateIncident } from '../../creditek/workers/aura-hub/src/incidents.mjs';

const env = { KORA_SUPABASE_SERVICE_KEY: 'service-test-key' };
const uuid = '11111111-1111-4111-8111-111111111111';
const validBody = {
  local_incident_id: uuid,
  title: 'Error al abrir calendario',
  description: 'El calendario queda en blanco al abrirlo.',
  expected: 'El calendario debe mostrar las publicaciones.',
  module: 'Calendario de contenido',
};

function request(body = validBody, authorization = 'Bearer aura-jwt') {
  return new Request('https://registro.crediteksas.com/creditek/agentes/api/incidents', {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function authenticatedFetch({ incident = { id: uuid, incident_code: 'KORA-2026-000123', reused: false }, rpcStatus = 200 } = {}) {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/auth/v1/user')) return Response.json({ id: uuid, email: 'oscar@crediteksas.com' });
    if (String(url).includes('/rpc/aura_my_access')) return Response.json({ active: true, apps: [{ app_id: 'sofia' }] });
    if (String(url).includes('/rpc/kora_create_incident_bridge_v1')) return Response.json(incident, { status: rpcStatus });
    throw new Error(`Unexpected URL: ${url}`);
  };
  return { calls, fetcher };
}

test('rechaza una solicitud sin sesión AURA antes de tocar KORA', async () => {
  const calls = [];
  const response = await createCorporateIncident(request(validBody, ''), env, async (...args) => {
    calls.push(args);
    return new Response('', { status: 401 });
  });
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test('devuelve exactamente el código aceptado por KORA', async () => {
  const { calls, fetcher } = authenticatedFetch();
  const response = await createCorporateIncident(request(), env, fetcher);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, incident_code: 'KORA-2026-000123', reused: false });
  const bridgeCall = calls.find(call => call.url.includes('kora_create_incident_bridge_v1'));
  assert.ok(bridgeCall);
  assert.equal(JSON.parse(bridgeCall.options.body).p_local_incident_id, uuid);
});

test('no finge creación cuando KORA rechaza la incidencia', async () => {
  const { fetcher } = authenticatedFetch({ incident: { message: 'rejected' }, rpcStatus: 400 });
  const response = await createCorporateIncident(request(), env, fetcher);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { ok: false, error: 'KORA no pudo registrar la incidencia.' });
});

test('rechaza evidencia inválida antes de crear una incidencia', async () => {
  const { calls, fetcher } = authenticatedFetch();
  const response = await createCorporateIncident(request({ ...validBody, evidence: { name: 'x.exe', type: 'application/octet-stream', data: 'AAAA' } }), env, fetcher);
  assert.equal(response.status, 400);
  assert.equal(calls.some(call => call.url.includes('kora_create_incident_bridge_v1')), false);
});


import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../creditek/workers/creditek-bot/index.js', import.meta.url), 'utf8');

test('expone preflight protegido y explícitamente sin envíos', () => {
  assert.match(source, /\/api\/campaigns\/preflight/);
  assert.match(source, /if \(!autorizado\).*status: 401/);
  assert.match(source, /sends_enabled: false/);
  assert.match(source, /mode: "preflight_only"/);
});

test('el preflight limita consultas y no llama al endpoint de mensajes', () => {
  const start = source.indexOf('url.pathname === "/api/campaigns/preflight"');
  const end = source.indexOf('url.pathname === "/api/stats"', start);
  const block = source.slice(start, end);
  assert.match(block, /limit=1000/);
  assert.doesNotMatch(block, /graph\.facebook\.com/);
  assert.doesNotMatch(block, /enviarMensajeWA/);
});

test('informa claramente cuando la migración aún no está aplicada', () => {
  assert.match(source, /campaign_schema_not_ready/);
  assert.match(source, /202608270001_sofia_whatsapp_campaigns_v1\.sql/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../creditek/workers/creditek-bot/index.js', import.meta.url), 'utf8');

test('expone preflight protegido por sesión AURA y explícitamente sin envíos', () => {
  assert.match(source, /\/api\/campaigns\/preflight/);
  assert.match(source, /authorizeSofiaCampaign\(request.*"sofia\.campaign\.read"/);
  assert.doesNotMatch(source.slice(
    source.indexOf('url.pathname === "/api/campaigns/preflight"'),
    source.indexOf('url.pathname === "/api/campaigns/templates"'),
  ), /X-Worker-Secret/);
  assert.match(source, /sends_enabled: false/);
  assert.match(source, /mode: "preflight_only"/);
});

test('el preflight limita consultas y no llama al endpoint de mensajes', () => {
  const start = source.indexOf('url.pathname === "/api/campaigns/preflight"');
  const end = source.indexOf('url.pathname === "/api/campaigns/templates"', start);
  const block = source.slice(start, end);
  assert.match(block, /limit=1000/);
  assert.doesNotMatch(block, /graph\.facebook\.com/);
  assert.doesNotMatch(block, /enviarMensajeWA/);
});

test('consulta en Meta únicamente plantillas de marketing aprobadas', () => {
  const start = source.indexOf('url.pathname === "/api/campaigns/templates"');
  const end = source.indexOf('url.pathname === "/api/campaigns/drafts"', start);
  const block = source.slice(start, end);
  assert.match(block, /authorizeSofiaCampaign\(request.*"sofia\.campaign\.read"/);
  assert.match(block, /message_templates\?fields=name,status,category,language/);
  assert.match(block, /status === "APPROVED" && item\.category === "MARKETING"/);
  assert.match(block, /sends_enabled: false/);
});

test('el borrador exige permiso de escritura, revalida Meta y limita el piloto a cinco', () => {
  const start = source.indexOf('url.pathname === "/api/campaigns/drafts"');
  const end = source.indexOf('url.pathname === "/api/stats"', start);
  const block = source.slice(start, end);
  assert.match(block, /authorizeSofiaCampaign\(request.*"sofia\.campaign\.write"/);
  assert.match(block, /template_not_approved/);
  assert.match(block, /pilot_limit: 5/);
  assert.match(block, /status: "draft"/);
  assert.match(block, /sends_enabled: false/);
  assert.doesNotMatch(block, /enviarMensajeWA|\/messages/);
});

test('informa claramente cuando la migración aún no está aplicada', () => {
  assert.match(source, /campaign_schema_not_ready/);
  assert.match(source, /202608270001_sofia_whatsapp_campaigns_v1\.sql/);
});

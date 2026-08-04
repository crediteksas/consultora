import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../creditek/agentes/agente3-meta-ads.html', import.meta.url), 'utf8');
const worker = await readFile(new URL('../../creditek/workers/aura-meta-ads-api/src/index.ts', import.meta.url), 'utf8').catch(() => '');
const migration = await readFile(new URL('../../supabase/migrations/20260802_aura_meta_ads_read_permissions.sql', import.meta.url), 'utf8').catch(() => '');

test('Agente 3 no contiene tokens, claves ni llamadas directas a Meta o al backend de KORA', () => {
  assert.doesNotMatch(html, /graph\.facebook\.com|EAA[A-Za-z0-9]|sk-ant-|META_ACCESS_TOKEN|WORKER_SHARED_SECRET|localStorage\.setItem\(['"]meta/i);
  assert.doesNotMatch(html, /KORA_API|kora[^'"\s]*\.workers\.dev|\/api\/kora/i);
  assert.match(html, /kora-shell\.css\?v=2\.0\.4/);
  assert.match(html, /sidebar\.js\?v=2\.0\.4/);
});

test('el navegador usa el Worker dedicado y la sesión AURA', () => {
  assert.match(html, /aura-meta-ads-api/);
  assert.match(html, /agente3-aura-session\.mjs/);
  assert.doesNotMatch(html, /sofia\.use/);
});

test('el frontend termina los estados de carga y muestra errores del backend', () => {
  assert.match(html, /function fail\([^)]*\)[\s\S]*#campaigns[\s\S]*#trends/);
  assert.match(html, /catch\([^)]*\)[\s\S]*fail\(/);
  assert.match(html, /401[\s\S]*403[\s\S]*429[\s\S]*502[\s\S]*503/);
});

test('el Worker es de solo lectura y no acepta tokens del navegador', () => {
  assert.match(worker, /meta_ads\.read/);
  assert.match(worker, /META_ACCESS_TOKEN/);
  assert.doesNotMatch(worker, /request\.headers\.get\(['"]x-meta-token/);
  assert.doesNotMatch(worker, /KORA|from\(['"][^'"]*kora/i);
});

test('Meta Ads tiene permisos propios y no hereda acceso de Sofía', () => {
  for (const permission of ['meta_ads.access','meta_ads.read','meta_ads.analyze','meta_ads.manage','meta_ads.campaign.create','meta_ads.campaign.pause','meta_ads.budget.manage','meta_ads.audit.read']) {
    assert.match(migration, new RegExp(permission.replace('.', '\\.')));
  }
  assert.match(migration, /select id, 'aura\.owner', array\[\s*'meta_ads\.read'\s*\]::text\[\]/);
  assert.doesNotMatch(migration, /sofia\.use/);
  assert.match(migration, /comercial@crediteksas\.com/);
});

test('Meta Ads audita con una función aislada y de solo lectura', () => {
  assert.match(worker, /aura_meta_ads_record_action/);
  assert.doesNotMatch(worker, /\/rpc\/aura_record_action/);
  assert.match(migration, /create or replace function public\.aura_meta_ads_record_action/);
  assert.match(migration, /p_action <> 'meta_ads\.dashboard\.read'/);
  assert.match(migration, /aura_audit_log/);
  assert.match(migration, /grant execute on function public\.aura_meta_ads_record_action/);
  assert.match(migration, /aura_audit_log_app_id_check/);
  assert.match(migration, /'portal_b2b'[\s\S]*'sofia'[\s\S]*'meta_ads'/);
});

test('Agente 3 expone el publicador seguro sin recibir ni guardar credenciales Meta', () => {
  for (const marker of ['publisher-piece','publisher-cities','publisher-platform-facebook','publisher-platform-instagram','publisher-objective','publisher-budget','publisher-start','publisher-end','publisher-copy','publisher-headline','publisher-cta','publisher-preview','publisher-confirm','publisher-submit']) {
    assert.match(html, new RegExp(`id=["']${marker}["']`));
  }
  assert.match(html, /\/v1\/publisher\/options/);
  assert.match(html, /\/v1\/publisher\/publish/);
  assert.match(html, /idempotency-key/i);
  assert.doesNotMatch(html, /ck_meta_token|META_PAGE_ACCESS_TOKEN|access_token/);
});

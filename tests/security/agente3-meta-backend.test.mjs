import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../creditek/agentes/agente3-meta-ads.html', import.meta.url), 'utf8');
const worker = await readFile(new URL('../../creditek/workers/aura-meta-ads-api/src/index.ts', import.meta.url), 'utf8').catch(() => '');
const migration = await readFile(new URL('../../supabase/migrations/20260802_aura_meta_ads_read_permissions.sql', import.meta.url), 'utf8').catch(() => '');

test('Agente 3 no contiene tokens, claves ni llamadas directas a Meta o KORA', () => {
  assert.doesNotMatch(html, /graph\.facebook\.com|EAA[A-Za-z0-9]|sk-ant-|META_ACCESS_TOKEN|WORKER_SHARED_SECRET|localStorage\.setItem\(['"]meta/i);
  assert.doesNotMatch(html, /kora/i);
});

test('el navegador usa el Worker dedicado y la sesión AURA', () => {
  assert.match(html, /aura-meta-ads-api/);
  assert.match(html, /agente3-aura-session\.mjs/);
  assert.doesNotMatch(html, /sofia\.use/);
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

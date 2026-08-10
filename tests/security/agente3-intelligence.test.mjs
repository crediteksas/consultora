import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../creditek/agentes/agente3-meta-ads.html', import.meta.url), 'utf8');
const worker = await readFile(new URL('../../creditek/workers/aura-meta-ads-api/src/index.ts', import.meta.url), 'utf8');

test('Agente 3 evalúa, interpreta y recomienda sin inventar Opportunity Score', () => {
  for (const marker of ['Evaluación de campaña','portfolioReading','scoreCampaign','renderCampaigns','ACCIÓN RECOMENDADA','OPORTUNIDADES DE META']) assert.match(html, new RegExp(marker));
  assert.match(html, /Sin datos/);
  assert.match(html, /SIN CONCLUSIÓN/);
});

test('Agente 3 diferencia objetivos, tendencias y anomalías', () => {
  assert.match(html, /OUTCOME_LEADS/);
  assert.match(html, /OUTCOME_ENGAGEMENT/);
  assert.match(html, /OUTCOME_SALES/);
  assert.match(html, /Mejorando/);
  assert.match(html, /frecuencia alta/);
  assert.match(html, /gasto sin resultados/);
});

test('Agente 3 separa resultados y creación sin recargar ni duplicar estado', () => {
  assert.match(html, /class="agent3-tabs"/);
  assert.match(html, /data-agent3-tab="campaigns"/);
  assert.match(html, /data-agent3-tab="create"/);
  assert.match(html, /id="agent3-campaigns-panel"/);
  assert.match(html, /id="agent3-create-panel"[^>]*hidden/);
  assert.match(html, /function setupAgent3Tabs\(\)/);
  assert.equal((html.match(/id="publisher-form"/g) || []).length, 1);
  assert.equal((html.match(/id="publisher-ab-enabled"/g) || []).length, 1);
  assert.ok(html.indexOf('id="publisher"') > html.indexOf('id="agent3-create-panel"'));
});

test('Intelligence coexiste con preflight, publicación, activación y rollback', () => {
  for (const marker of [
    'META_PREFLIGHT_CREATIVE_FAILED',
    'META_CREATIVE_CREATE_FAILED',
    'META_ADSET_ACTIVATION_FAILED',
    'META_AD_ACTIVATION_FAILED',
    'META_CAMPAIGN_ACTIVATION_FAILED',
    "status: 'PAUSED'",
    "status: 'ACTIVE'",
  ]) assert.ok(worker.includes(marker), `missing worker marker: ${marker}`);
  assert.match(html, /PUBLICAR CAMPAÑA/);
});

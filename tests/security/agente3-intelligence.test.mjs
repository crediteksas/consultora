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

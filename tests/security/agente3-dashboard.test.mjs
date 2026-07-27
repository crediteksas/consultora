import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  aggregateCampaignInsights,
  calculateBudget,
  computeMetrics,
  getDateRanges,
  hasMetricsData,
  reconcileCampaignTotals,
} = require(
  path.resolve(import.meta.dirname, '../../creditek/agentes/agente3-dashboard.js'),
);

test('el resumen aditivo combina campañas sin duplicar tipos de acción', () => {
  const aggregated = aggregateCampaignInsights([
    {
      spend: '100',
      impressions: '1000',
      clicks: '10',
      reach: '500',
      actions: [
        { action_type: 'lead', value: '2' },
        { action_type: 'link_click', value: '10' },
      ],
    },
    {
      spend: '200',
      impressions: '2000',
      clicks: '20',
      reach: '1000',
      actions: [
        { action_type: 'lead', value: '3' },
        { action_type: 'link_click', value: '20' },
      ],
    },
  ]);

  assert.deepEqual(aggregated, {
    spend: 300,
    impressions: 3000,
    clicks: 30,
    reach: 1500,
    frequency: 2,
    cpm: 100,
    cpc: 10,
    ctr: 1,
    actions: [
      { action_type: 'lead', value: 5 },
      { action_type: 'link_click', value: 30 },
    ],
  });
});

test('7 días usa exactamente siete fechas y el período anterior no se superpone', () => {
  const ranges = getDateRanges(7, new Date('2026-07-26T12:00:00-05:00'));

  assert.deepEqual(ranges, {
    current: { since: '2026-07-20', until: '2026-07-26' },
    previous: { since: '2026-07-13', until: '2026-07-19' },
  });
});

test('presupuesto conserva el porcentaje real y separa saldo de sobreejecución', () => {
  assert.deepEqual(calculateBudget(250000, 200000), {
    spent: 250000,
    budget: 200000,
    percentage: 125,
    barPercentage: 100,
    remaining: 0,
    overrun: 50000,
  });

  assert.deepEqual(calculateBudget(50000, 200000), {
    spent: 50000,
    budget: 200000,
    percentage: 25,
    barPercentage: 25,
    remaining: 150000,
    overrun: 0,
  });
});

test('métricas separan clics, conversaciones y leads sin contar interacciones dos veces', () => {
  const metrics = computeMetrics({
    spend: '120000',
    impressions: '10000',
    reach: '7000',
    clicks: '500',
    actions: [
      { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '40' },
      { action_type: 'lead', value: '5' },
      { action_type: 'link_click', value: '500' },
      { action_type: 'landing_page_view', value: '300' },
    ],
  });

  assert.equal(metrics.clicks, 500);
  assert.equal(metrics.conversations, 40);
  assert.equal(metrics.leads, 5);
  assert.equal(metrics.results, 45);
  assert.equal(metrics.cpr, 120000 / 45);
});

test('valores vacíos producen ceros explícitos y nunca NaN o Infinity', () => {
  const metrics = computeMetrics({
    spend: '',
    impressions: null,
    reach: undefined,
    actions: [],
  });

  for (const value of Object.values(metrics)) {
    assert.equal(Number.isFinite(value), true);
  }
  assert.equal(metrics.cpr, 0);
});

test('distingue ausencia de datos de una respuesta real con valores en cero', () => {
  assert.equal(hasMetricsData(null), false);
  assert.equal(hasMetricsData({}), false);
  assert.equal(hasMetricsData({ spend: '0', impressions: '0' }), true);
});

test('los totales aditivos del tablero se reconcilian con el detalle de campañas', () => {
  const result = reconcileCampaignTotals(
    { spend: '300', impressions: '3000', clicks: '30' },
    [
      { spend: '100', impressions: '1000', clicks: '10' },
      { spend: '200', impressions: '2000', clicks: '20' },
    ],
  );

  assert.deepEqual(result, {
    matches: true,
    account: { spend: 300, impressions: 3000, clicks: 30 },
    campaigns: { spend: 300, impressions: 3000, clicks: 30 },
  });
});

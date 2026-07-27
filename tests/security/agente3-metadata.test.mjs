import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  buildCampaignMetadata,
  classifyCampaigns,
  filterCampaigns,
  filterTrendSeries,
  getMetadataFilterOptions,
} = require(
  path.resolve(import.meta.dirname, '../../creditek/agentes/agente3-metadata.js'),
);

const campaigns = [
  { campaign_id: 'camp-1', spend: '100', actions: [{ action_type: 'lead', value: '2' }] },
  { campaign_id: 'camp-2', spend: '200', actions: [{ action_type: 'lead', value: '3' }] },
  { campaign_id: 'legacy', spend: '50', actions: [] },
];

const metadata = {
  'camp-1': {
    campaign_id: 'camp-1',
    platform: 'PayJoy',
    cities: [
      { key: '101', name: 'Apartadó', origin: 'aliados' },
      { key: '202', name: 'Barranquilla', origin: 'aliados' },
    ],
  },
  'camp-2': {
    campaign_id: 'camp-2',
    platform: 'Addi',
    cities: [{ key: '101', name: 'Apartadó', origin: 'propias' }],
  },
};

test('construye metadatos sin nombres de aliados, tiendas, direcciones ni vendedores', () => {
  const result = buildCampaignMetadata({
    campaignId: 'camp-1',
    adsetId: 'set-1',
    adIds: ['ad-1', 'ad-2'],
    selectedIds: ['aliado_101', 'aliado_101_repetido', 'tolu'],
    zones: {
      aliado_101: { key: '101', name: 'Apartadó', region: 'Antioquia', region_id: '697', ally_name: 'Privado' },
      aliado_101_repetido: { key: '101', name: 'Apartadó', region: 'Antioquia', region_id: '697', seller: 'Privado' },
      tolu: { key: '480653', name: 'Tolú', region: 'Sucre', region_id: '740', address: 'Privado' },
    },
    platform: 'PayJoy',
    createdBy: 'usuario@creditek.test',
    createdAt: '2026-07-27T05:00:00.000Z',
  });

  assert.deepEqual(result, {
    campaign_id: 'camp-1',
    adset_id: 'set-1',
    ad_ids: ['ad-1', 'ad-2'],
    cities: [
      { key: '101', name: 'Apartadó', origin: 'aliados' },
      { key: '480653', name: 'Tolú', origin: 'propias' },
    ],
    origins: ['aliados', 'propias'],
    platform: 'PayJoy',
    created_by: 'usuario@creditek.test',
    created_at: '2026-07-27T05:00:00.000Z',
  });
  assert.doesNotMatch(JSON.stringify(result), /Privado|ally_name|seller|address|tienda|vendedor/i);
});

test('una campaña con varias ciudades aparece una sola vez al filtrar', () => {
  const result = filterCampaigns(campaigns, metadata, {
    cityKey: '101',
    platform: '',
    origin: '',
  });

  assert.deepEqual(result.map(item => item.campaign_id), ['camp-1', 'camp-2']);
  assert.equal(new Set(result.map(item => item.campaign_id)).size, result.length);
});

test('combina ciudad, plataforma y origen con criterio AND', () => {
  assert.deepEqual(
    filterCampaigns(campaigns, metadata, {
      cityKey: '101',
      platform: 'PayJoy',
      origin: 'aliados',
    }).map(item => item.campaign_id),
    ['camp-1'],
  );
});

test('campañas antiguas sin metadatos quedan como Sin clasificar', () => {
  const classified = classifyCampaigns(campaigns, metadata);
  assert.equal(classified.find(item => item.campaign_id === 'legacy').creditek_metadata.classification, 'Sin clasificar');
  assert.deepEqual(
    filterCampaigns(campaigns, metadata, {
      cityKey: '__unclassified__',
      platform: 'Sin clasificar',
      origin: 'Sin clasificar',
    }).map(item => item.campaign_id),
    ['legacy'],
  );
});

test('opciones de filtros deduplican municipios por key', () => {
  const options = getMetadataFilterOptions(campaigns, metadata);
  assert.deepEqual(options.cities, [
    { key: '101', name: 'Apartadó' },
    { key: '202', name: 'Barranquilla' },
    { key: '__unclassified__', name: 'Sin clasificar' },
  ]);
  assert.deepEqual(options.platforms, ['Addi', 'PayJoy', 'Sin clasificar']);
  assert.deepEqual(options.origins, ['aliados', 'propias', 'Sin clasificar']);
});

test('los filtros también seleccionan las campañas de cada punto temporal sin duplicarlas', () => {
  const series = [{
    week: 0,
    data: [
      { campaign_id: 'camp-1', spend: '100' },
      { campaign_id: 'camp-1', spend: '100' },
      { campaign_id: 'camp-2', spend: '200' },
    ],
  }];

  assert.deepEqual(
    filterTrendSeries(series, metadata, {
      cityKey: '101',
      platform: 'PayJoy',
      origin: 'aliados',
    })[0].data.map(item => item.campaign_id),
    ['camp-1'],
  );
});

test('Agente 3 guarda metadatos y aplica filtros en todo el tablero', async () => {
  const html = await readFile(
    path.resolve(import.meta.dirname, '../../creditek/agentes/agente3-meta-ads.html'),
    'utf8',
  );

  assert.match(html, /\/api\/meta-campaigns-metadata/);
  assert.match(html, /buildCampaignMetadata\(/);
  assert.match(html, /function applyMetadataFilters\(/);
  assert.match(html, /filterTrendSeries\(/);
  assert.match(html, /id="wiz-platform"/);
  assert.match(html, /id="filter-city"/);
  assert.match(html, /id="filter-platform"/);
  assert.match(html, /id="filter-origin"/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const html = await readFile(
  path.join(root, 'creditek/agentes/agente3-meta-ads.html'),
  'utf8',
);

test('Aliados se renderiza como una tarjeta de ciudad dentro de la cuadrícula', () => {
  assert.match(html, /card\.id = 'wiz-aliados-btn'/);
  assert.match(html, /card\.className = 'zone-card'/);
  assert.doesNotMatch(html, /<button[^>]+id="wiz-aliados-btn"/);

  const renderStart = html.indexOf('function renderWizZones()');
  const aliadosCard = html.indexOf("card.id = 'wiz-aliados-btn'", renderStart);
  const customZones = html.indexOf('Object.entries(wizCustomZones)', renderStart);

  assert.ok(aliadosCard > renderStart);
  assert.ok(customZones > aliadosCard);
});

test('el HTML usa un único constructor de ciudades para estimación y publicación', () => {
  assert.match(html, /src="agente3-targeting\.js"/);
  assert.equal(
    (html.match(/CreditekMetaTargeting\.buildMetaCities/g) || []).length,
    2,
  );
});

test('el flujo valida keys y usa nombres de municipios deduplicados en resumen y campaña', () => {
  assert.match(html, /CreditekMetaTargeting\.validateSelectedZones/);
  assert.match(html, /CreditekMetaTargeting\.buildSummaryNames/);
  assert.match(html, /document\.getElementById\('wiz-rev-zone'\)\.textContent = zoneNames/);
  assert.doesNotMatch(
    html.slice(html.indexOf('function wizGoStep'), html.indexOf('async function publicarCampana')),
    /ally_name|seller|address|social_network|tienda|vendedor|direcci[oó]n|instagram|facebook/i,
  );
});

test('el tablero publicado usa el dominio de fechas, métricas y presupuesto', () => {
  assert.match(html, /src="agente3-dashboard\.js"/);
  assert.match(html, /CreditekMetaDashboard\.getDateRanges/);
  assert.match(html, /CreditekMetaDashboard\.calculateBudget/);
  assert.match(html, /CreditekMetaDashboard\.computeMetrics/);
  assert.match(html, /CreditekMetaDashboard\.aggregateCampaignInsights/);
  assert.doesNotMatch(html, /date_preset=today&level=campaign/);
});

test('el payload de Meta deduplica municipios por la key geográfica', () => {
  const require = createRequire(import.meta.url);
  const { buildMetaCities } = require(
    path.join(root, 'creditek/agentes/agente3-targeting.js'),
  );

  const cities = buildMetaCities(
    ['aliado_123', 'aliado_repetido_123', 'tolu'],
    {
      aliado_123: {
        key: '123',
        name: 'Municipio aliado',
        region: 'Sucre',
        region_id: '740',
      },
      aliado_repetido_123: {
        key: 123,
        name: 'El mismo municipio',
        region: 'Sucre',
        region_id: 740,
      },
      tolu: {
        key: '480653',
        name: 'Tolú',
        region: 'Sucre',
        region_id: '740',
      },
    },
  );

  assert.deepEqual(cities, [
    {
      key: '123',
      radius: 20,
      distance_unit: 'kilometer',
      region: 'Sucre',
      region_id: '740',
      country: 'CO',
    },
    {
      key: '480653',
      radius: 20,
      distance_unit: 'kilometer',
      region: 'Sucre',
      region_id: '740',
      country: 'CO',
    },
  ]);
});

test('el resumen final muestra solo municipios únicos y nunca metadatos del aliado', () => {
  const require = createRequire(import.meta.url);
  const { buildSummaryNames } = require(
    path.join(root, 'creditek/agentes/agente3-targeting.js'),
  );

  const names = buildSummaryNames(
    ['aliado_a', 'aliado_b', 'aliado_c'],
    {
      aliado_a: {
        key: '123',
        name: 'Suan',
        region: 'Atlántico',
        ally_name: 'Almacén confidencial',
        seller: 'Vendedor confidencial',
      },
      aliado_b: {
        key: '123',
        name: 'Suan repetido',
        region: 'Atlántico',
        address: 'Dirección confidencial',
      },
      aliado_c: {
        key: '456',
        name: 'Malambo',
        region: 'Atlántico',
        social_network: '@cuenta_privada',
      },
    },
  );

  assert.deepEqual(names, ['Suan', 'Malambo']);
  assert.doesNotMatch(names.join(' '), /Almacén|Vendedor|Dirección|@/);
});

test('una zona seleccionada sin key válida bloquea el payload con mensaje claro', () => {
  const require = createRequire(import.meta.url);
  const { validateSelectedZones } = require(
    path.join(root, 'creditek/agentes/agente3-targeting.js'),
  );

  assert.deepEqual(
    validateSelectedZones(['aliado_valido'], {
      aliado_valido: { key: '123', name: 'Suan', region: 'Atlántico', region_id: '725' },
    }),
    { valid: true, error: null },
  );

  assert.deepEqual(
    validateSelectedZones(['aliado_sin_key'], {
      aliado_sin_key: { key: '', name: 'Municipio sin resolver' },
    }),
    {
      valid: false,
      error: 'No se puede continuar: Municipio sin resolver no tiene una ubicación válida de Meta.',
    },
  );
});

test('desmarcar una zona la elimina del estado y del payload', () => {
  const require = createRequire(import.meta.url);
  const { updateSelectedZone, buildMetaCities } = require(
    path.join(root, 'creditek/agentes/agente3-targeting.js'),
  );

  const selected = new Set(['aliado_123', 'aliado_456']);
  updateSelectedZone(selected, 'aliado_123', false);

  assert.deepEqual([...selected], ['aliado_456']);
  assert.deepEqual(
    buildMetaCities(selected, {
      aliado_123: { key: '123', region: 'Sucre', region_id: '740' },
      aliado_456: { key: '456', region: 'Atlántico', region_id: '725' },
    }).map(city => city.key),
    ['456'],
  );
});

test('la búsqueda de ubicaciones normaliza nombre, municipio o ciudad sin alterar el término', () => {
  const require = createRequire(import.meta.url);
  const { normalizeLocationQuery } = require(
    path.join(root, 'creditek/agentes/agente3-targeting.js'),
  );

  assert.equal(normalizeLocationQuery('  El Carmen de Bolívar  '), 'El Carmen de Bolívar');
  assert.equal(normalizeLocationQuery(''), '');
});

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

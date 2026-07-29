import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyNormalizationRules,
  buildImportRecord,
  chooseWinningOffers,
  projectPublicCatalog,
} from '../../creditek/portal/catalog-domain.mjs';

test('conserva íntegro el texto original de cada lista importada', () => {
  const rawText = '📱 OFERTA\nInfinix Smart 20 $410.000\nWhatsApp 300 000 0000';
  const record = buildImportRecord({
    providerId: 'inity',
    rawText,
    importedBy: 'user-1',
  });

  assert.equal(record.rawText, rawText);
  assert.equal(record.providerId, 'inity');
});

test('reutiliza una corrección administrativa exacta sin volver a preguntar', () => {
  const candidates = [{
    sourceReference: 'INFINIX SMART20 128',
    brand: 'INFINIX',
    storageGb: 128,
  }];
  const rules = [{
    providerId: 'inity',
    sourceReference: 'INFINIX SMART20 128',
    canonicalProductId: 'product-smart-20-128',
    active: true,
  }];

  assert.deepEqual(
    applyNormalizationRules(candidates, rules, 'inity'),
    [{
      ...candidates[0],
      canonicalProductId: 'product-smart-20-128',
      learned: true,
    }],
  );
});

test('elige el menor costo solo entre ofertas nuevas, disponibles y equivalentes', () => {
  const offers = [
    { id: 'a', canonicalProductId: 'p1', cost: 430000, condition: 'new', availability: 'available' },
    { id: 'b', canonicalProductId: 'p1', cost: 410000, condition: 'new', availability: 'available' },
    { id: 'c', canonicalProductId: 'p1', cost: 390000, condition: 'used', availability: 'available' },
    { id: 'd', canonicalProductId: 'p1', cost: 400000, condition: 'new', availability: 'on_order' },
  ];

  assert.deepEqual(chooseWinningOffers(offers), [{ canonicalProductId: 'p1', offerId: 'b', cost: 410000 }]);
});

test('la proyección pública nunca entrega proveedor, costo, margen ni utilidad', () => {
  const publicItems = projectPublicCatalog([{
    id: 'item-1',
    canonicalProductId: 'product-1',
    name: 'INFINIX SMART 20 4/128GB',
    brand: 'INFINIX',
    category: 'Celular',
    salePrice: 430000,
    imageSlug: 'INFINIX_SMART_20_4128GB',
    providerId: 'inity',
    providerName: 'Inity Colombia',
    cost: 410000,
    margin: 20000,
    utility: 20000,
  }]);

  assert.deepEqual(publicItems, [{
    catalog_item_id: 'item-1',
    canonical_product_id: 'product-1',
    nombre: 'INFINIX SMART 20 4/128GB',
    marca: 'INFINIX',
    categoria: 'Celular',
    precioVenta: 430000,
    image_slug: 'INFINIX_SMART_20_4128GB',
  }]);
  assert.equal(JSON.stringify(publicItems).includes('410000'), false);
  assert.equal(JSON.stringify(publicItems).includes('Inity'), false);
});

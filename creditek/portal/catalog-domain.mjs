const PUBLIC_FIELDS = Object.freeze([
  'catalog_item_id',
  'canonical_product_id',
  'nombre',
  'marca',
  'categoria',
  'precioVenta',
  'image_slug',
]);

const normalizeKey = value => String(value ?? '')
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toUpperCase();

export function buildImportRecord({ providerId, rawText, importedBy }) {
  if (!providerId) throw new Error('Selecciona un proveedor');
  if (!String(rawText ?? '').trim()) throw new Error('Pega la lista del proveedor');
  if (!importedBy) throw new Error('No fue posible identificar al usuario');

  return {
    providerId,
    rawText: String(rawText),
    importedBy,
  };
}

export function applyNormalizationRules(candidates, rules, providerId) {
  const activeRules = new Map(
    rules
      .filter(rule => rule.active && rule.providerId === providerId)
      .map(rule => [normalizeKey(rule.sourceReference), rule]),
  );

  return candidates.map(candidate => {
    const rule = activeRules.get(normalizeKey(candidate.sourceReference));
    if (!rule) return { ...candidate, learned: false };
    return {
      ...candidate,
      canonicalProductId: rule.canonicalProductId,
      learned: true,
    };
  });
}

export function chooseWinningOffers(offers) {
  const eligible = offers.filter(offer =>
    offer.canonicalProductId &&
    offer.condition === 'new' &&
    offer.availability === 'available' &&
    Number.isFinite(Number(offer.cost)) &&
    Number(offer.cost) > 0,
  );
  const winners = new Map();

  for (const offer of eligible) {
    const current = winners.get(offer.canonicalProductId);
    if (!current || Number(offer.cost) < current.cost) {
      winners.set(offer.canonicalProductId, {
        canonicalProductId: offer.canonicalProductId,
        offerId: offer.id,
        cost: Number(offer.cost),
      });
    }
  }

  return [...winners.values()].sort((a, b) =>
    a.canonicalProductId.localeCompare(b.canonicalProductId),
  );
}

export function projectPublicCatalog(items) {
  return items.map(item => {
    const projected = {
      catalog_item_id: item.id,
      canonical_product_id: item.canonicalProductId,
      nombre: item.name,
      marca: item.brand,
      categoria: item.category,
      precioVenta: Number(item.salePrice),
      image_slug: item.imageSlug || null,
    };
    return Object.fromEntries(PUBLIC_FIELDS.map(field => [field, projected[field]]));
  });
}

export function classifyException(candidate) {
  const condition = normalizeKey(candidate.condition);
  const availability = normalizeKey(candidate.availability);
  if (['USED', 'REFURBISHED', 'A', 'A+', 'A++'].includes(condition)) return 'not_publishable';
  if (availability === 'ON_ORDER') return 'on_order';
  if (!candidate.canonicalProductId) return 'unmatched';
  if (!candidate.imageSlug) return 'missing_image';
  if (candidate.suspiciousPrice) return 'suspicious_price';
  return null;
}

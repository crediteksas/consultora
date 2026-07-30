const cleanSpaces = value => String(value || '').replace(/\s+/g, ' ').trim();

export const normalizeCanonicalText = value => cleanSpaces(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, ' ')
  .trim()
  .toUpperCase();

const titleCase = value => cleanSpaces(value)
  .toLocaleLowerCase('es')
  .replace(/(^|[\s-])\p{L}/gu, match => match.toLocaleUpperCase('es'));

export const parseReferenceProposal = sourceReference => {
  const source = cleanSpaces(sourceReference)
    .replace(/^[^\p{L}\d]+/u, '')
    .replace(/\s*[→>-]+\s*$/u, '');
  const colorMatch = source.match(/\(([^)]+)\)/);
  const colors = colorMatch
    ? colorMatch[1].split(/\s*(?:,|\/|\by\b)\s*/i).map(titleCase).filter(Boolean)
    : [];
  const withoutColors = cleanSpaces(source.replace(/\([^)]+\)/g, ''));
  const memory = withoutColors.match(/\b(\d{1,2})\s*(?:GB)?\s*\/\s*(\d{2,4})\s*(?:GB)?\b/i);
  const connectivity = withoutColors.match(/\b(2G|3G|4G|5G|LTE)\b/i)?.[1]?.toUpperCase() || '';
  const brand = titleCase(withoutColors.split(' ')[0] || '');
  const model = cleanSpaces(withoutColors
    .slice((withoutColors.split(' ')[0] || '').length)
    .replace(memory?.[0] || '', '')
    .replace(new RegExp(`\\b${connectivity}\\b`, 'i'), '')
    .replace(/\bGB\b/gi, ''));

  return {
    brand,
    model,
    ramGb: memory ? Number(memory[1]) : null,
    storageGb: memory ? Number(memory[2]) : null,
    connectivity,
    colors,
    category: 'Celulares',
  };
};

export const buildCanonicalName = fields => cleanSpaces([
  titleCase(fields.brand),
  cleanSpaces(fields.model),
  String(fields.connectivity || '').toUpperCase(),
  fields.ramGb ? `${Number(fields.ramGb)}GB/${Number(fields.storageGb)}GB` : '',
].filter(Boolean).join(' '));

export const findSimilarCanonical = (proposal, products) => {
  const signature = [
    proposal.brand,
    proposal.model,
    proposal.ramGb,
    proposal.storageGb,
    proposal.connectivity,
  ].map(normalizeCanonicalText).join('|');
  return products.find(product => {
    const parsed = parseReferenceProposal(product.canonical_name || product.name || '');
    const candidate = [
      product.brand || parsed.brand,
      parsed.model,
      parsed.ramGb,
      parsed.storageGb,
      parsed.connectivity,
    ].map(normalizeCanonicalText).join('|');
    return candidate === signature;
  }) || null;
};

const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');

const normalize = value => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es');

export const formatProviderLabel = provider => {
  const name = clean(provider?.name);
  const commercialName = clean(provider?.commercial_name);
  if (!name) return commercialName;
  if (!commercialName || normalize(name) === normalize(commercialName)) return name;
  return `${name} — ${commercialName}`;
};

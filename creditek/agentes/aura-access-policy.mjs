export const AURA_CAPABILITIES = Object.freeze({
  SOFIA: 'sofia.use',
  META_ADS: 'meta_ads.read',
  CLIENTES: 'clientes.read',
  NOVA: 'nova.read',
  CARTERA: 'cartera.read',
  CONVENIOS: 'convenios.read',
  GENERAL_LINK: 'general_link.read',
  CONSULTAS: 'consultas.read',
  CONFIG: 'aura.config',
});

const FULL_ACCESS_ROLES = new Set(['aura.owner', 'aura.admin']);
const ROLE_CAPABILITIES = Object.freeze({
  'aura.andrea_limited': new Set([
    AURA_CAPABILITIES.CONVENIOS,
    AURA_CAPABILITIES.GENERAL_LINK,
    AURA_CAPABILITIES.CARTERA,
    AURA_CAPABILITIES.CONSULTAS,
  ]),
});

export function auraRoles(access) {
  return new Set((Array.isArray(access?.apps) ? access.apps : [])
    .map(grant => grant?.role_id)
    .filter(Boolean));
}

export function hasAuraCapability(access, capability) {
  if (!access || access.active === false || !capability) return false;
  const grants = Array.isArray(access.apps) ? access.apps : [];
  const roles = auraRoles(access);
  if ([...roles].some(role => FULL_ACCESS_ROLES.has(role))) return true;
  if (grants.some(grant => Array.isArray(grant?.permissions) && grant.permissions.includes(capability))) return true;
  return [...roles].some(role => ROLE_CAPABILITIES[role]?.has(capability));
}

export function isAuraFunctionalAdmin(access) {
  return [...auraRoles(access)].some(role => FULL_ACCESS_ROLES.has(role));
}

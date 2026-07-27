import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const productionEndpoints = require('./production-endpoints.js');
const ENVIRONMENTS = new Set(['development', 'staging', 'production']);
const PRODUCTION_CONFIRMATION = 'KORA_PRODUCTION_ADMIN_WRITE';

function hostname(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    throw new Error('La URL del proyecto objetivo no es válida');
  }
}

export function validateAdminExecution(options) {
  if (!ENVIRONMENTS.has(options.environment)) {
    throw new Error('El entorno es obligatorio: development, staging o production');
  }
  if (!options.targetProject || options.confirmProject !== options.targetProject) {
    throw new Error('La confirmación del proyecto objetivo no coincide');
  }
  const targetHost = hostname(options.targetUrl);
  if (targetHost.split('.')[0] !== options.targetProject) {
    throw new Error('El proyecto objetivo no coincide con la URL indicada');
  }
  const knownProductionHost = productionEndpoints.hosts.includes(targetHost);
  if (options.environment !== 'production' && knownProductionHost) {
    throw new Error('Un entorno no productivo no puede usar un destino productivo');
  }
  if (options.environment === 'production' && !options.allowProduction) {
    throw new Error('Production está bloqueado por defecto');
  }
  if (
    options.environment === 'production'
    && options.confirmProduction !== PRODUCTION_CONFIRMATION
  ) {
    throw new Error('Falta la confirmación adicional para production');
  }
  return Object.freeze({
    dryRun: options.dryRun !== false,
    environment: options.environment,
    targetHost,
    targetProject: options.targetProject,
    requiresServiceKey: options.dryRun === false,
  });
}

export { PRODUCTION_CONFIRMATION };

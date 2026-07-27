(function exposeKoraEnvironment(root, factory) {
  const api = factory(root?.KORA_PRODUCTION_ENDPOINTS, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KoraEnvironment = api;
}(typeof window !== 'undefined' ? window : globalThis, function createKoraEnvironment(defaultProductionEndpoints, root) {
  const PUBLIC_KEYS = Object.freeze([
    'KORA_ENV',
    'KORA_VERSION',
    'KORA_ENV_LABEL',
    'KORA_ERP_SUPABASE_URL',
    'KORA_ERP_SUPABASE_ANON_KEY',
    'KORA_AGENTS_SUPABASE_URL',
    'KORA_AGENTS_SUPABASE_ANON_KEY',
    'KORA_CLIENTS_WORKER_URL',
    'KORA_GEMINI_WORKER_URL',
    'KORA_PDF_COMBINER_URL',
    'KORA_BOT_WORKER_URL',
    'KORA_AGENTS_AUTH_URL',
  ]);
  const URL_KEYS = Object.freeze(PUBLIC_KEYS.filter(key => key.endsWith('_URL')));
  const ENVIRONMENTS = new Set(['development', 'staging', 'production']);
  const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
  const FORBIDDEN_KEY_NAME = /(?:SERVICE|SECRET|PASSWORD|PRIVATE|SIGNING|DEPLOY|GCP_)/i;
  const FORBIDDEN_VALUE = /(?:service_role|BEGIN [A-Z ]*PRIVATE KEY|AIza[A-Za-z0-9_-]{20,}|\bsk-[A-Za-z0-9_-]{12,})/i;

  function configError(message) {
    const error = new Error(`Configuración KORA inválida: ${message}`);
    error.name = 'KoraEnvironmentError';
    return error;
  }

  function productionHosts(endpoints) {
    const hosts = endpoints?.hosts;
    if (!Array.isArray(hosts) || !hosts.length) {
      throw configError('no existe la fuente de destinos productivos');
    }
    return new Set(hosts.map(host => String(host).toLowerCase()));
  }

  function parseUrl(value, key, environment) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw configError(`${key} debe ser una URL válida`);
    }
    const localDevelopment = environment === 'development' && LOCAL_HOSTS.has(parsed.hostname);
    if (parsed.protocol !== 'https:' && !(localDevelopment && parsed.protocol === 'http:')) {
      throw configError(`${key} debe usar HTTPS o un host local de development`);
    }
    return parsed;
  }

  function validateEnvironment(input, options = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw configError('se esperaba un objeto de configuración pública');
    }
    for (const key of Object.keys(input)) {
      if (!PUBLIC_KEYS.includes(key) && FORBIDDEN_KEY_NAME.test(key)) {
        throw configError(`${key} no está permitida en el frontend`);
      }
    }
    const output = {};
    for (const key of PUBLIC_KEYS) {
      const value = input[key];
      if (typeof value !== 'string' || !value.trim()) {
        throw configError(`falta ${key}`);
      }
      if (FORBIDDEN_VALUE.test(value)) {
        throw configError(`${key} contiene una credencial no permitida`);
      }
      output[key] = value.trim();
    }
    if (!ENVIRONMENTS.has(output.KORA_ENV)) {
      throw configError('KORA_ENV debe ser development, staging o production');
    }

    const parsedUrls = Object.fromEntries(
      URL_KEYS.map(key => [key, parseUrl(output[key], key, output.KORA_ENV)]),
    );
    const production = productionHosts(options.productionEndpoints || defaultProductionEndpoints);
    if (output.KORA_ENV !== 'production') {
      for (const [key, parsed] of Object.entries(parsedUrls)) {
        if (production.has(parsed.hostname.toLowerCase())) {
          throw configError(`${key} apunta a un destino productivo`);
        }
      }
    }
    if (
      parsedUrls.KORA_ERP_SUPABASE_URL.origin.toLowerCase()
      === parsedUrls.KORA_AGENTS_SUPABASE_URL.origin.toLowerCase()
    ) {
      throw configError('ERP y Agentes deben usar proyectos distintos');
    }
    return Object.freeze(output);
  }

  function createSafeLogger(logger = console) {
    return Object.freeze({
      error(message) {
        logger.error(`${String(message)} [REDACTED]`);
      },
      info(message) {
        logger.info?.(String(message));
      },
    });
  }

  function install(options = {}) {
    if (!root || !root.__KORA_ENV__) {
      throw configError('falta window.__KORA_ENV__');
    }
    const validated = validateEnvironment(root.__KORA_ENV__, options);
    root.__KORA_ENV__ = validated;
    return validated;
  }

  function renderConfigurationError(_error, documentRef = root?.document) {
    if (!documentRef?.body || typeof documentRef.createElement !== 'function') {
      throw configError('no existe un documento donde mostrar el error');
    }
    const alert = documentRef.createElement('div');
    alert.id = 'koraEnvironmentError';
    alert.className = 'kora-environment-error';
    alert.setAttribute('role', 'alert');
    alert.textContent = 'La configuración de KORA no está disponible. Contacta al administrador.';
    documentRef.body.prepend(alert);
    return alert;
  }

  return Object.freeze({
    PUBLIC_KEYS,
    createSafeLogger,
    install,
    renderConfigurationError,
    validateEnvironment,
  });
}));

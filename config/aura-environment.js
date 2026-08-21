(function exposeAuraEnvironment(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AuraEnvironment = api;
}(typeof window !== 'undefined' ? window : globalThis, function createAuraEnvironment(root) {
  'use strict';

  const PUBLIC_KEYS = Object.freeze([
    'AURA_ENV',
    'AURA_SUPABASE_URL',
    'AURA_SUPABASE_ANON_KEY',
    'AURA_BOT_WORKER_URL',
    'AURA_GEMINI_WORKER_URL',
    'AURA_PORTAL_URL',
    'AURA_CONVENIOS_URL',
  ]);
  const DEFAULT_LINKS = Object.freeze({
    portal: 'https://registro.crediteksas.com/creditek/portal/index.html',
    convenios: 'https://registro.crediteksas.com/creditek/convenios/index.html',
  });

  function publicConfig() {
    const input = root?.__AURA_ENV__;
    if (!input || typeof input !== 'object' || Array.isArray(input)) return Object.freeze({});
    return Object.freeze(Object.fromEntries(
      PUBLIC_KEYS.filter(key => typeof input[key] === 'string' && input[key].trim())
        .map(key => [key, input[key].trim()]),
    ));
  }

  function url(name) {
    const key = name === 'portal' ? 'AURA_PORTAL_URL' : 'AURA_CONVENIOS_URL';
    return publicConfig()[key] || DEFAULT_LINKS[name];
  }

  return Object.freeze({ DEFAULT_LINKS, PUBLIC_KEYS, publicConfig, url });
}));

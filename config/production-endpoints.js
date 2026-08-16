(function exposeProductionEndpoints(root, factory) {
  const endpoints = factory();
  if (typeof module === 'object' && module.exports) module.exports = endpoints;
  if (root) root.KORA_PRODUCTION_ENDPOINTS = endpoints;
}(typeof window !== 'undefined' ? window : globalThis, function createProductionEndpoints() {
  return Object.freeze({
    hosts: Object.freeze([
      'jfkmiyvcdfbsbwchyvol.supabase.co',
      'ditiwpndvmyuqcagupea.supabase.co',
      'creditek-clientes.comercial-853.workers.dev',
      'creditek-gemini-proxy.comercial-853.workers.dev',
      'creditek-pdf-combiner.comercial-853.workers.dev',
      'creditek-bot.comercial-853.workers.dev',
      'registro.crediteksas.com',
    ]),
  });
}));

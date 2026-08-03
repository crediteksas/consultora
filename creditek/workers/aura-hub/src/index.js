const NO_STORE = 'no-store, no-cache, must-revalidate, max-age=0';
const CURRENT_DOCUMENT = '/creditek/agentes/aura-otp-20260802';
const MANAGED_PATHS = new Set([
  '/creditek/agentes/index.html',
  '/creditek/agentes/aura-auth.mjs',
  '/creditek/agentes/aura-auth-otp-20260802.mjs',
  '/creditek/agentes/creditek-agente-respuestas.html',
  '/creditek/agentes/agente3-meta-ads.html',
  '/creditek/agentes/agente3-aura-session.mjs',
]);
const CANONICAL_DOCUMENTS = new Set([
  '/creditek/agentes/creditek-agente-respuestas',
  '/creditek/agentes/agente3-meta-ads',
]);

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    const isDocument = pathname === '/creditek/agentes'
      || pathname === '/creditek/agentes/'
      || pathname === '/creditek/agentes/index.html';
    const assetPath = isDocument ? CURRENT_DOCUMENT : null;
    const assetRequest = assetPath ? new Request(new URL(assetPath, request.url), request) : request;
    const response = await env.ASSETS.fetch(assetRequest);
    const headers = new Headers(response.headers);
    if (isDocument || MANAGED_PATHS.has(pathname) || CANONICAL_DOCUMENTS.has(pathname)) {
      headers.set('cache-control', NO_STORE);
      headers.set('pragma', 'no-cache');
      headers.set('expires', '0');
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};

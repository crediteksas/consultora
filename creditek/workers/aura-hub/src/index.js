const NO_STORE = 'no-store, no-cache, must-revalidate, max-age=0';
const CURRENT_DOCUMENT = '/creditek/agentes/aura-otp-20260802.html';

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    const isDocument = pathname === '/creditek/agentes'
      || pathname === '/creditek/agentes/'
      || pathname === '/creditek/agentes/index.html';
    const assetRequest = isDocument
      ? new Request(new URL(CURRENT_DOCUMENT, request.url), request)
      : request;
    const response = await env.ASSETS.fetch(assetRequest);
    const headers = new Headers(response.headers);
    if (isDocument) {
      headers.set('cache-control', NO_STORE);
      headers.set('pragma', 'no-cache');
      headers.set('expires', '0');
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};

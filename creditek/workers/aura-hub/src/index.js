const NO_STORE = 'no-store, no-cache, must-revalidate, max-age=0';

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    const pathname = new URL(request.url).pathname;
    const isDocument = pathname === '/creditek/agentes'
      || pathname === '/creditek/agentes/'
      || pathname === '/creditek/agentes/index.html'
      || headers.get('content-type')?.includes('text/html');
    if (isDocument) {
      headers.set('cache-control', NO_STORE);
      headers.set('pragma', 'no-cache');
      headers.set('expires', '0');
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};

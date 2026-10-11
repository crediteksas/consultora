// Exact-route overlay: all existing AURA APIs, assets and bindings stay with legacy.
export function organicOverlay(legacy, assets) {
  return {
    async fetch(request, env, ctx) {
      const path = new URL(request.url).pathname;
      if (['GET', 'HEAD'].includes(request.method) && Object.hasOwn(assets, path)) {
        const { body, type } = assets[path];
        return new Response(request.method === 'HEAD' ? null : body, { headers: { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-aura-organic-release': '20261011-review' } });
      }
      const entry = ['/creditek/agentes/', '/creditek/agentes/index.html', '/creditek/agentes/creditek-agente-calendario.html'].includes(path);
      // These pages were served asset-first in production. Keep that exact source;
      // the legacy Worker's home HTML is older than the currently served asset.
      const response = entry && ['GET', 'HEAD'].includes(request.method)
        ? await env.ASSETS.fetch(request)
        : await legacy.fetch(request, env, ctx);
      if (!entry || request.method !== 'GET' || !response.ok || !response.headers.get('content-type')?.includes('text/html')) return response;
      const headers = new Headers(response.headers);
      for (const name of ['etag', 'content-length', 'last-modified']) headers.delete(name);
      headers.set('cache-control', 'no-store');
      return new HTMLRewriter().on('body', { element(e) {
        e.prepend('<nav aria-label="Publicación orgánica" style="padding:12px 24px;background:#0b1e3d;color:white;border-bottom:3px solid #00c4cc"><a href="/creditek/agentes/aura-organic-studio.html" style="color:#69eef0;font:600 14px system-ui">Contenido orgánico · Crear, aprobar calendario y medir →</a></nav>', { html: true });
      } }).transform(new Response(response.body, { status: response.status, statusText: response.statusText, headers }));
    },
  };
}

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
      return addOrganicEntryNavigation(response, path);
    },
  };
}

// Shared by the static origin overlay and the route Worker that actually serves
// the installed app. Does not fetch, authenticate, or change existing scripts.
export function addOrganicEntryNavigation(response, path) {
      const headers = new Headers(response.headers);
      for (const name of ['etag', 'content-length', 'last-modified']) headers.delete(name);
      headers.set('cache-control', 'no-store');
      const rewriter = new HTMLRewriter();
      if (path.endsWith('creditek-agente-calendario.html')) {
        rewriter.on('body', { element(e) {
          e.prepend('<nav aria-label="Publicación orgánica"><a href="/creditek/agentes/aura-organic-studio.html">Contenido orgánico · Crear, aprobar calendario y medir →</a></nav>', { html: true });
        } });
      } else {
        // Place controls INSIDE the existing scrollable shell, not above its
        // fixed-height app. Reuse owner visibility and same-window module loader.
        rewriter.on('.nav-item[data-aura-owner-only][href="/creditek/agentes/nova-supervision.html"]', { element(e) {
          e.after('<a class="nav-item" data-organic-app-nav data-aura-owner-only hidden href="/creditek/agentes/aura-organic-studio.html" onclick="openModule(\'/creditek/agentes/aura-organic-studio.html\',\'Contenido orgánico\',this,\'organic\');return false;"><i data-lucide="images"></i><span>Contenido orgánico</span></a>', { html: true });
        } });
        rewriter.on('[data-nova-dashboard-card]', { element(e) {
          e.after('<a class="module-card" data-organic-app-card data-aura-owner-only hidden href="/creditek/agentes/aura-organic-studio.html" onclick="openModuleFromCard(\'/creditek/agentes/aura-organic-studio.html\',\'Contenido orgánico\',\'organic\');return false;" style="text-decoration:none;color:inherit"><div class="module-top"><i data-lucide="images"></i></div><div class="module-name">Contenido orgánico</div><div class="module-desc">Crea y revisa publicaciones de Instagram y Facebook. Solo se programa el calendario aprobado.</div><div class="module-meta">Abrir dentro de AURA →</div></a>', { html: true });
        } });
      }
      return rewriter.transform(new Response(response.body, { status: response.status, statusText: response.statusText, headers }));
}

import { handleAuraEnlacesProxy } from './aura-enlaces-proxy.mjs';

const cspReportOnly = [
  "default-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

function secureHtml(response) {
  if (!response.headers.get('content-type')?.toLowerCase().includes('text/html')) return response;
  const headers = new Headers(response.headers);
  headers.set('content-security-policy-report-only', cspReportOnly);
  headers.set('x-frame-options', 'DENY');
  headers.set('strict-transport-security', 'max-age=31536000');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/instalar' || url.pathname === '/instalar/') {
      return secureHtml(await env.ASSETS.fetch(new Request(new URL('/creditek/erp/instalar.html', url), request)));
    }
    if (url.pathname.startsWith('/api/aura/enlaces')) {
      return handleAuraEnlacesProxy(request, env);
    }
    if (url.pathname !== '/kora-build-manifest.json') return secureHtml(await env.ASSETS.fetch(request));

    const staticResponse = await env.ASSETS.fetch(new Request(new URL('/kora-build-manifest.static.json', url), request));
    if (!staticResponse.ok) return new Response('Manifiesto no disponible', { status: 503 });
    const build = await staticResponse.json();
    const release = await env.KORA_RELEASES.get('production', 'json') || {};
    const version = env.CF_VERSION_METADATA || {};
    return Response.json({
      ...build,
      deploymentId: release.deploymentId || null,
      workerVersion: version.id || release.workerVersion || null,
      deployedAt: release.deployedAt || version.timestamp || null,
      branch: release.branch || build.branch,
      buildStatus: release.buildStatus || build.buildStatus,
      runtimeMatchesRelease: Boolean(version.id && version.id === release.workerVersion),
    }, { headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
  },
};

const NO_STORE = 'no-store, no-cache, must-revalidate, max-age=0';
const CURRENT_DOCUMENT = '/creditek/agentes/index.html';
const PUBLICADOR_PATH = '/creditek/agentes/api/publicador';
const AURA_URL = 'https://ditiwpndvmyuqcagupea.supabase.co';
const AURA_KEY = 'sb_publishable_oVNantrnKzXdtXu5B7YQIg_9fxHp7aW';
const PUBLICADOR_PIECES = `${AURA_URL}/rest/v1/calendario_piezas?select=id,fecha,tipo,estado,plataformas&order=fecha.desc&limit=500`;
const PUBLICADOR_ORIGINS = 'https://creditek-clientes.comercial-853.workers.dev/api/origenes';
const MANAGED_PATHS = new Set([
  '/creditek/agentes/index.html',
  '/creditek/agentes/aura-auth.mjs',
  '/creditek/agentes/aura-auth-otp-20260802.mjs',
  '/creditek/agentes/creditek-agente-redes.html',
  '/creditek/agentes/creditek-agente-respuestas.html',
  '/creditek/agentes/redes-publicador.js',
  '/creditek/agentes/sofia-aura-20260803.html',
  '/creditek/agentes/sofia-aura-20260803b.html',
  '/creditek/agentes/agente3-meta-ads.html',
  '/creditek/agentes/agente3-aura-session.mjs',
]);
const CANONICAL_DOCUMENTS = new Set([
  '/creditek/agentes/creditek-agente-respuestas',
  '/creditek/agentes/agente3-meta-ads',
  '/creditek/agentes/sofia-aura-20260803',
]);

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname === PUBLICADOR_PATH && request.method === 'GET') {
      const authorization = request.headers.get('authorization') || '';
      if (!authorization.startsWith('Bearer ')) {
        return Response.json({ ok: false, error: 'SESION_REQUERIDA' }, { status: 401, headers: { 'cache-control': NO_STORE } });
      }
      const accessResponse = await fetch(`${AURA_URL}/rest/v1/rpc/aura_my_access`, {
        method: 'POST',
        headers: { apikey: AURA_KEY, authorization, 'content-type': 'application/json' },
        body: '{}',
      });
      if (!accessResponse.ok) {
        return Response.json({ ok: false, error: 'SESION_INVALIDA' }, { status: 401, headers: { 'cache-control': NO_STORE } });
      }
      const access = await accessResponse.json();
      const sofia = Array.isArray(access?.apps) ? access.apps.find(app => app?.app_id === 'sofia') : null;
      if (!Array.isArray(sofia?.permissions) || !sofia.permissions.includes('sofia.use')) {
        return Response.json({ ok: false, error: 'ACCESO_DENEGADO' }, { status: 403, headers: { 'cache-control': NO_STORE } });
      }
      try {
        const [piecesResponse, originsResponse] = await Promise.all([
          fetch(PUBLICADOR_PIECES, { headers: { apikey: AURA_KEY } }),
          fetch(PUBLICADOR_ORIGINS),
        ]);
        if (!piecesResponse.ok || !originsResponse.ok) throw new Error('UPSTREAM');
        const pendientes = await piecesResponse.json();
        const originsPayload = await originsResponse.json();
        if (!originsPayload?.ok || !Array.isArray(originsPayload.origenes)) throw new Error('ORIGINS');
        return Response.json({ ok: true, pendientes, origenes: originsPayload.origenes }, { headers: { 'cache-control': NO_STORE } });
      } catch {
        return Response.json({ ok: false, error: 'PUBLICADOR_NO_DISPONIBLE' }, { status: 502, headers: { 'cache-control': NO_STORE } });
      }
    }
    const isDocument = pathname === '/creditek/agentes'
      || pathname === '/creditek/agentes/'
      || pathname === '/creditek/agentes/index.html';
    const assetPath = isDocument ? CURRENT_DOCUMENT : null;
    const assetRequest = assetPath ? new Request(new URL(assetPath, request.url), request) : request;
    const response = await env.ASSETS.fetch(assetRequest);
    const headers = new Headers(response.headers);
    if (isDocument || MANAGED_PATHS.has(pathname) || CANONICAL_DOCUMENTS.has(pathname)) {
      headers.set('cache-control', NO_STORE);
      headers.set('cloudflare-cdn-cache-control', 'no-store');
      headers.set('cdn-cache-control', 'no-store');
      headers.set('pragma', 'no-cache');
      headers.set('expires', '0');
    }
    if (isDocument) {
      headers.set('x-aura-worker', 'aura-hub');
      headers.set('x-aura-document', CURRENT_DOCUMENT);
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};

import { authenticateAuraOwner } from './aura-enlaces-proxy.mjs';

const DEFAULT_SOFIA_WORKER_URL = 'https://creditek-bot.comercial-853.workers.dev';
const MAX_BODY_BYTES = 16_384;

const ROUTES = new Map([
  ['/api/sofia/tiendas', { method: 'GET', upstream: '/api/tiendas' }],
  ['/api/sofia/stats', { method: 'GET', upstream: '/api/stats' }],
  ['/api/sofia/ventas-por-anuncio', { method: 'GET', upstream: '/api/ventas-por-anuncio' }],
  ['/api/sofia/enviar-mensaje', { method: 'POST', upstream: '/api/enviar-mensaje' }],
]);

function reply(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

export async function handleAuraSofiaProxy(request, env, fetcher = fetch) {
  if (!await authenticateAuraOwner(request, fetcher)) {
    return reply({ ok: false, error: 'No autorizado' }, 403);
  }
  if (!env.WORKER_SHARED_SECRET) {
    return reply({ ok: false, error: 'Servicio temporalmente no disponible' }, 503);
  }

  const route = ROUTES.get(new URL(request.url).pathname);
  if (!route) return reply({ ok: false, error: 'Ruta no encontrada' }, 404);
  if (request.method !== route.method) {
    return reply({ ok: false, error: 'Método no permitido' }, 405);
  }

  let body;
  if (request.method === 'POST') {
    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > MAX_BODY_BYTES) {
      return reply({ ok: false, error: 'Solicitud demasiado grande' }, 413);
    }
    body = await request.text();
    if (body.length > MAX_BODY_BYTES) {
      return reply({ ok: false, error: 'Solicitud demasiado grande' }, 413);
    }
  }

  const base = String(env.SOFIA_WORKER_URL || DEFAULT_SOFIA_WORKER_URL).replace(/\/$/, '');
  try {
    const upstream = await fetcher(`${base}${route.upstream}`, {
      method: route.method,
      headers: {
        accept: 'application/json',
        'x-worker-secret': env.WORKER_SHARED_SECRET,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body } : {}),
    });

    if (!upstream.ok) {
      const status = upstream.status === 401 || upstream.status === 403 ? 502 : upstream.status;
      return reply({ ok: false, error: 'Servicio temporalmente no disponible' }, status);
    }

    const headers = new Headers({
      'cache-control': 'no-store',
      'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    });
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return reply({ ok: false, error: 'Servicio temporalmente no disponible' }, 503);
  }
}

// Preserve the verified live worker, including patches absent from repository index.js.
import legacy, { authenticate, allowed, reply } from './production-baseline-20261011.mjs';
import { organicApi } from './organic-api.mjs';
export { RateLimiter, PublicationCoordinator } from './production-baseline-20261011.mjs';
export { OrganicCalendar } from './organic-calendar.mjs';
export default {
  fetch(request, env, ctx) {
    if (!new URL(request.url).pathname.startsWith('/v1/organic/')) return legacy.fetch(request, env, ctx);
    const origin = request.headers.get('origin');
    if (origin && origin !== env.ALLOWED_ORIGIN) return reply({ error: 'ORIGIN_DENIED' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': origin || env.ALLOWED_ORIGIN, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'authorization, content-type', 'vary': 'Origin' } });
    return organicApi(request, env, { authenticate, allowed, reply }, origin);
  },
};

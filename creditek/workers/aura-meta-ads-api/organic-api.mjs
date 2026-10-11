import { OrganicError, requireOrganicOwner, boundedBytes, jpegDimensions, digest } from './organic-model.mjs';
import { connection, publicConnection } from './organic-meta.mjs';

export async function organicApi(request, env, { authenticate, allowed, reply }, origin) {
  const url = new URL(request.url), path = url.pathname.replace(/^\/v1\/organic/, '');
  try {
    const media = path.match(/^\/media\/([a-f0-9]{64}\.jpg)$/);
    if (request.method === 'GET' && media) {
      const object = await env.ORGANIC_MEDIA?.get(media[1]);
      if (!object) return reply({ error: 'NOT_FOUND' }, 404, origin);
      return new Response(object.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*' } });
    }
    const auth = await authenticate(request, env);
    if (!auth) throw new OrganicError('LOGIN_REQUIRED', 401);
    requireOrganicOwner(auth);
    const rate = await allowed(env, auth.access.user_id);
    if (!rate.ok) throw new OrganicError('RATE_LIMIT', 429);
    if (!env.ORGANIC_CALENDARS || !env.ORGANIC_MEDIA) throw new OrganicError('ORGANIC_BINDINGS_NOT_CONFIGURED', 503);
    const calendar = env.ORGANIC_CALENDARS.getByName(`page:${env.META_PAGE_ID}`);
    if (request.method === 'GET' && path === '/connection') return reply(publicConnection(await connection(env), env), 200, origin);
    if (request.method === 'GET' && path === '/calendars') return reply(await calendar.list(), 200, origin);
    if (request.method === 'GET' && path === '/preview') return reply(await calendar.preview(url.searchParams.get('id')), 200, origin);
    if (request.method === 'POST' && path === '/media') {
      const bytes = await boundedBytes(request, 8 * 1024 * 1024);
      const dimensions = jpegDimensions(bytes), hash = await digest(bytes), key = `${hash}.jpg`;
      if (!await env.ORGANIC_MEDIA.head(key)) await env.ORGANIC_MEDIA.put(key, bytes, { sha256: hash, httpMetadata: { contentType: 'image/jpeg' } });
      return reply({ asset: key, url: `${env.ORGANIC_PUBLIC_BASE}/v1/organic/media/${key}`, ...dimensions }, 201, origin);
    }
    if (request.method === 'POST' && ['/calendars', '/approve', '/pause'].includes(path)) {
      let input;
      try { input = JSON.parse(new TextDecoder().decode(await boundedBytes(request, 128 * 1024))); } catch (e) { if (e instanceof OrganicError) throw e; throw new OrganicError('INVALID_JSON'); }
      const actor = auth.access.user_id;
      const result = path === '/calendars' ? await calendar.save(input, actor) : path === '/approve' ? await calendar.approve(input, actor) : await calendar.pause(input.id, actor);
      return reply(result, 200, origin);
    }
    return reply({ error: 'NOT_FOUND' }, 404, origin);
  } catch (error) {
    const code = /^[A-Z_0-9]+$/.test(error.message) ? error.message : 'ORGANIC_OPERATION_FAILED';
    const mappedStatus = code === 'NOT_FOUND' ? 404 : /CONFLICT|APPROVAL_REQUIRED|REVIEW_REQUIRED|IMMUTABLE|MISSING_.*_PERMISSIONS/.test(code) ? 409 : 503;
    return reply({ ok: false, error: code }, error.status || mappedStatus, origin);
  }
}

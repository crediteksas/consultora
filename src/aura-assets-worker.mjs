import { handleAuraEnlacesProxy } from './aura-enlaces-proxy.mjs';
import { handleAuraSofiaProxy } from './aura-sofia-proxy.mjs';
import { handleAuraAccessCheck } from './aura-access-check.mjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/') {
      return Response.redirect(new URL('/creditek/agentes/', url), 302);
    }
    if (url.pathname.startsWith('/api/aura/enlaces')) {
      return handleAuraEnlacesProxy(request, env);
    }
    if (url.pathname === '/api/aura/access') {
      return handleAuraAccessCheck(request);
    }
    if (url.pathname.startsWith('/api/sofia/')) {
      return handleAuraSofiaProxy(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};

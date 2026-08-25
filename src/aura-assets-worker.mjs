import { handleAuraEnlacesProxy } from './aura-enlaces-proxy.mjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/') {
      return Response.redirect(new URL('/creditek/agentes/', url), 302);
    }
    if (url.pathname.startsWith('/api/aura/enlaces')) {
      return handleAuraEnlacesProxy(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
